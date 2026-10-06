import { Async, Lane, R, err, ok, type AsyncResult, type Result } from 'two-track';
import { DEVTOOLS_ENABLED } from '#devtools';
import type { AnyDriver, Command, Concurrency, RetryPolicy } from '../command.js';
import type { CommandPhase, CommandTrace } from '../devtools-events.js';

// EXPERIMENT (ADR 0015, branch exp/two-track-v2): the no-Effect command interpreter rebuilt on
// the `two-track` library. A driver run is an AsyncResult that never rejects
// (`Async.tryPromise`), retries use `Async.retry` + `Async.backoff`, a throwing message
// mapper is caught with `R.fromThrowable`, and the switch/exhaust/queue lanes are
// `Lane.switchLane` / `exhaustLane` / `queueLane` sharing one lane-level abort signal that
// disconnect fires (queued commands then resolve Busy without starting). Merge, streaming
// `emit` and devtools tracing are Gyral's own.

/** Runs commands for one connected element. Disposed on disconnect. */
export interface Interpreter<M> {
  readonly run: (cmd: Command<M>) => void;
  readonly dispose: () => void;
}

/** Reports one command's lifecycle to devtools (ADR 0017); undefined in production. */
type Report = ((phase: CommandPhase, result?: unknown) => void) | undefined;

/** Why a run left the success track: the driver failed, or the task was interrupted. */
type Failure =
  { readonly interrupted: true } | { readonly interrupted: false; readonly cause: unknown };

const interrupted: Failure = { interrupted: true };
const failed = (cause: unknown): Failure => ({ interrupted: false, cause });

/** Resolves (never rejects) with `interrupted` as soon as `signal` aborts. */
const onAbort = (signal: AbortSignal): Promise<Result<Failure, never>> =>
  new Promise((resolve) => {
    if (signal.aborted) resolve(err(interrupted));
    else
      signal.addEventListener(
        'abort',
        () => {
          resolve(err(interrupted));
        },
        { once: true },
      );
  });

/** Gyral's policy as a two-track one: `times` retries after the first attempt. */
const delayOf = (policy: RetryPolicy): ((retry: number) => number) => {
  const base = policy.delayMs ?? 0;
  return policy.backoff === 'exponential' ? Async.backoff({ baseMs: base }) : () => base;
};

/** One driver attempt as a railway value; an abort wins the race. */
const attempt = (
  driver: AnyDriver,
  cmd: Command<unknown>,
  signal: AbortSignal,
  emit: (output: unknown) => void,
): AsyncResult<Failure, unknown> =>
  Promise.race([
    Async.tryPromise(
      // The input type was erased by command(); it was built for this driver's name.
      (s) => Promise.resolve(driver.run(cmd.input as never, { signal: s, emit })),
      failed,
      signal,
    ),
    onAbort(signal),
  ]);

const runDriver = (
  driver: AnyDriver,
  cmd: Command<unknown>,
  signal: AbortSignal,
  emit: (output: unknown) => void,
): AsyncResult<Failure, unknown> => {
  const policy = driver.retry;
  if (policy === undefined) return attempt(driver, cmd, signal, emit);
  // An abort during a backoff wait ends the retry as Aborted without another attempt.
  return Async.retry(() => attempt(driver, cmd, signal, emit), {
    attempts: policy.times + 1,
    delay: delayOf(policy),
    retriable: (failure) => !failure.interrupted,
    signal,
  }).then((result): Result<Failure, unknown> => {
    if (result.ok) return result;
    const error = result.error;
    return 'interrupted' in error ? err(error) : err(interrupted);
  });
};

/** Maps a result to a message and dispatches it; a throwing mapper is logged, not fatal. */
const deliver = <M>(map: () => M | undefined, dispatch: (msg: M) => void): void => {
  const mapped = R.fromThrowable(map, (defect) => defect);
  if (!mapped.ok) console.error('gyral: command mapper threw', mapped.error);
  else if (mapped.value !== undefined) dispatch(mapped.value);
};

async function execute<M>(
  driver: AnyDriver,
  cmd: Command<M>,
  signal: AbortSignal,
  dispatch: (msg: M) => void,
  report: Report,
): Promise<void> {
  let settled = false;
  const emit = (output: unknown): void => {
    if (!settled && !signal.aborted) deliver(() => cmd.onSuccess(output), dispatch);
  };
  if (DEVTOOLS_ENABLED && report !== undefined) {
    signal.addEventListener(
      'abort',
      () => {
        if (!settled) report('interrupted');
      },
      { once: true },
    );
  }
  const result = await runDriver(driver, cmd, signal, emit);
  if (signal.aborted) return; // interrupted: reported by the abort listener
  settled = true;
  if (result.ok) {
    if (DEVTOOLS_ENABLED) report?.('settled', result.value);
    deliver(() => cmd.onSuccess(result.value), dispatch);
    return;
  }
  if (result.error.interrupted) return;
  const cause = result.error.cause;
  const error = driver.toError === undefined ? cause : driver.toError(cause);
  if (DEVTOOLS_ENABLED) report?.('failed', error);
  if (cmd.onFailure === undefined) {
    console.warn(`gyral: unhandled failure from driver "${driver.name}"`, error);
    return;
  }
  const onFailure = cmd.onFailure;
  deliver(() => onFailure(error), dispatch);
}

/** One command waiting in, or running through, a lane. */
interface Job<M> {
  readonly driver: AnyDriver;
  readonly cmd: Command<M>;
  readonly report: Report;
  readonly started: () => void;
}

type LaneCall<M> = (job: Job<M>) => Promise<unknown>;

export function makeInterpreter<M>(
  resolve: (driver: AnyDriver) => AnyDriver,
  dispatch: (msg: M) => void,
  trace?: CommandTrace,
): Interpreter<M> {
  const reporter = (driver: string, lane: string, policy: Concurrency, input: unknown): Report =>
    trace === undefined
      ? undefined
      : (phase, result) => {
          trace({
            phase,
            driver,
            lane,
            policy,
            input,
            ...(result === undefined ? {} : { result }),
          });
        };
  /** Fired on disconnect: aborts every in-flight run and every queued lane call. */
  const life = new AbortController();
  const merged = new Set<AbortController>();
  const lanes = new Map<string, { readonly policy: Concurrency; readonly call: LaneCall<M> }>();
  const guardedDispatch = (msg: M): void => {
    if (!life.signal.aborted) dispatch(msg);
  };

  const runJob = async (signal: AbortSignal, job: Job<M>): AsyncResult<never, void> => {
    job.started();
    await execute(job.driver, job.cmd, signal, guardedDispatch, job.report);
    return ok(undefined);
  };

  const laneFor = (key: string, policy: Exclude<Concurrency, 'merge'>): LaneCall<M> => {
    const existing = lanes.get(key);
    if (existing?.policy === policy) return existing.call;
    // A lane's policy is fixed when it opens; a different policy on the same key opens a
    // new lane (the old one keeps its in-flight work).
    const options = { signal: life.signal };
    const call: LaneCall<M> =
      policy === 'switch'
        ? Lane.switchLane(runJob, options)
        : policy === 'exhaust'
          ? Lane.exhaustLane(runJob, options)
          : Lane.queueLane(runJob, options);
    lanes.set(key, { policy, call });
    return call;
  };

  const run = (cmd: Command<M>): void => {
    if (life.signal.aborted) return;
    const driver = resolve(cmd.driver);
    const key = cmd.key ?? driver.name;
    const policy = cmd.concurrency ?? driver.concurrency ?? 'merge';
    const report = DEVTOOLS_ENABLED ? reporter(driver.name, key, policy, cmd.input) : undefined;
    if (policy === 'merge') {
      if (DEVTOOLS_ENABLED) report?.('issued');
      const controller = new AbortController();
      merged.add(controller);
      void execute(driver, cmd, controller.signal, guardedDispatch, report).finally(() => {
        merged.delete(controller);
      });
      return;
    }
    const state = { started: false };
    const job: Job<M> = {
      driver,
      cmd,
      report,
      started: () => {
        state.started = true;
      },
    };
    // Report 'issued' before the lane call, except for exhaust, which only knows whether
    // it dropped the command once the (synchronous) call has returned.
    if (DEVTOOLS_ENABLED && policy !== 'exhaust') report?.('issued');
    void laneFor(key, policy)(job);
    if (DEVTOOLS_ENABLED && policy === 'exhaust') report?.(state.started ? 'issued' : 'dropped');
  };

  const dispose = (): void => {
    life.abort();
    for (const controller of merged) controller.abort();
    merged.clear();
    lanes.clear();
  };

  return { run, dispose };
}

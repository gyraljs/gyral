import {
  concatMap,
  createStream,
  defer,
  exhaustMap,
  external,
  mergeMap,
  subscribe,
  switchMap,
  type External,
  type Observable,
  type Operator,
} from 'pipewise';
import { DEVTOOLS_ENABLED } from '#devtools';
import type { AnyDriver, Command, Concurrency, RetryPolicy } from '../command.js';
import type { CommandPhase, CommandTrace } from '../devtools-events.js';

// EXPERIMENT (ADR 0015, branch exp/pipewise): the command interpreter on pipewise
// (Web Streams operators). Each lane is a stream of jobs piped through the lane's
// operator: merge → mergeMap, switch → switchMap, exhaust → exhaustMap, queue →
// concatMap. A job is a lazy inner stream (`defer` + `createStream`) whose lifetime
// signal is the driver's AbortSignal, so switching or disposing cancels the inner
// stream and aborts the driver. Intent → update → view stays synchronous: only the
// command side runs through streams. Retry stays a small hand-written loop (pipewise
// `retry` has no exponential backoff).

/** Runs commands for one connected element. Disposed on disconnect. */
export interface Interpreter<M> {
  readonly run: (cmd: Command<M>) => void;
  readonly dispose: () => void;
}

/** Reports one command's lifecycle to devtools (ADR 0017); undefined in production. */
type Report = ((phase: CommandPhase, result?: unknown) => void) | undefined;

/** Internal rejection for an aborted task; callers check `signal.aborted`, never this. */
class Interrupted extends Error {}

/** Rejects when `signal` aborts. Marked handled so a losing race never reports it. */
const aborted = (signal: AbortSignal): Promise<never> => {
  const promise = new Promise<never>((_resolve, reject) => {
    const interrupt = (): void => {
      reject(new Interrupted('gyral: command interrupted'));
    };
    if (signal.aborted) interrupt();
    else signal.addEventListener('abort', interrupt, { once: true });
  });
  promise.catch(() => undefined);
  return promise;
};

/** Waits `ms`, or rejects as soon as `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  Promise.race([
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
        },
        { once: true },
      );
    }),
    aborted(signal),
  ]);

/** Delay before retry number `retry` (0-based): fixed, or doubling from `delayMs`. */
const delayFor = (policy: RetryPolicy, retry: number): number => {
  const base = policy.delayMs ?? 0;
  return policy.backoff === 'exponential' ? base * 2 ** retry : base;
};

async function attemptWithRetry(
  driver: AnyDriver,
  cmd: Command<unknown>,
  signal: AbortSignal,
  emit: (output: unknown) => void,
): Promise<unknown> {
  const policy = driver.retry;
  for (let retry = 0; ; retry += 1) {
    try {
      // The input type was erased by command(); it was built for this driver's name.
      const result = Promise.resolve(driver.run(cmd.input as never, { signal, emit }));
      return await Promise.race([result, aborted(signal)]);
    } catch (cause) {
      if (signal.aborted || policy === undefined || retry >= policy.times) throw cause;
      await sleep(delayFor(policy, retry), signal);
    }
  }
}

/** Maps a result to a message and dispatches it; a throwing mapper is logged, not fatal. */
const deliver = <M>(map: () => M | undefined, dispatch: (msg: M) => void): void => {
  try {
    const msg = map();
    if (msg !== undefined) dispatch(msg);
  } catch (defect) {
    console.error('gyral: command mapper threw', defect);
  }
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
  let output: unknown;
  try {
    output = await attemptWithRetry(driver, cmd, signal, emit);
  } catch (cause) {
    if (signal.aborted) return; // interrupted: reported by the abort listener
    settled = true;
    const error = driver.toError === undefined ? cause : driver.toError(cause);
    if (DEVTOOLS_ENABLED) report?.('failed', error);
    if (cmd.onFailure === undefined) {
      console.warn(`gyral: unhandled failure from driver "${driver.name}"`, error);
      return;
    }
    const onFailure = cmd.onFailure;
    deliver(() => onFailure(error), dispatch);
    return;
  }
  if (signal.aborted) return;
  settled = true;
  if (DEVTOOLS_ENABLED) report?.('settled', output);
  deliver(() => cmd.onSuccess(output), dispatch);
}

interface Job<M> {
  readonly driver: AnyDriver;
  readonly cmd: Command<M>;
  readonly report: Report;
}

interface Lane<M> {
  readonly policy: Concurrency;
  readonly jobs: External<Job<M>>;
  readonly stop: AbortController;
  /** Jobs pushed and not yet finished; `exhaust` drops while this is above 0. */
  pending: number;
}

const laneOperator = <M>(
  policy: Concurrency,
  project: (job: Job<M>) => Observable<never>,
): Operator<Job<M>, never> => {
  switch (policy) {
    case 'switch':
      return switchMap(project);
    case 'exhaust':
      return exhaustMap(project);
    case 'queue':
      return concatMap(project);
    case 'merge':
      return mergeMap(project);
  }
};

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
  const lanes = new Map<string, Lane<M>>();
  const opened = new Set<Lane<M>>();
  let active = true;
  const guardedDispatch = (msg: M): void => {
    if (active) dispatch(msg);
  };

  const openLane = (key: string, policy: Concurrency): Lane<M> => {
    const lane: Lane<M> = {
      policy,
      jobs: external<Job<M>>(),
      stop: new AbortController(),
      pending: 0,
    };
    // A job's inner stream: created lazily on first read, so `exhaust` never starts a
    // driver it drops. Its lifetime signal is the driver's signal.
    const project = (job: Job<M>): Observable<never> =>
      defer(() =>
        createStream<never>(async (subscriber) => {
          try {
            await execute(job.driver, job.cmd, subscriber.signal, guardedDispatch, job.report);
          } finally {
            lane.pending -= 1;
          }
          subscriber.complete();
        }),
      );
    lane.jobs.observable
      .pipeThrough(laneOperator<M>(policy, project))
      .pipeTo(subscribe(), { signal: lane.stop.signal })
      .catch(() => undefined);
    lanes.set(key, lane);
    opened.add(lane);
    return lane;
  };

  const run = (cmd: Command<M>): void => {
    if (!active) return;
    const driver = resolve(cmd.driver);
    const key = cmd.key ?? driver.name;
    const policy = cmd.concurrency ?? driver.concurrency ?? 'merge';
    const report = DEVTOOLS_ENABLED ? reporter(driver.name, key, policy, cmd.input) : undefined;
    let lane = lanes.get(key);
    if (lane !== undefined && lane.policy !== policy) {
      // A lane's operator is fixed when it opens; a different policy on the same key
      // starts a new lane (the old one keeps its in-flight work).
      lane = undefined;
    }
    lane ??= openLane(key, policy);
    if (policy === 'exhaust' && lane.pending > 0) {
      if (DEVTOOLS_ENABLED) report?.('dropped');
      return;
    }
    if (DEVTOOLS_ENABLED) report?.('issued');
    lane.pending += 1;
    lane.jobs.next({ driver, cmd, report });
  };

  const dispose = (): void => {
    active = false;
    for (const lane of opened) lane.stop.abort();
    opened.clear();
    lanes.clear();
  };

  return { run, dispose };
}

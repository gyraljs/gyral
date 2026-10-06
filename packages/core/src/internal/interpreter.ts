import { DEVTOOLS_ENABLED } from '#devtools';
import type { AnyDriver, Command, Concurrency, RetryPolicy } from '../command.js';
import type { CommandPhase, CommandTrace } from '../devtools-events.js';

// The command interpreter (ADR 0015: hand-written, no runtime dependencies). Each running command is a task with its own AbortController; lanes hold the
// latest task per key. Interruption is `controller.abort()`, retry schedules are timers
// that cancel on abort, and `queue` chains on the previous task's promise.

/** Runs commands for one connected element. Disposed on disconnect. */
export interface Interpreter<M> {
  readonly run: (cmd: Command<M>) => void;
  readonly dispose: () => void;
}

interface Task {
  readonly controller: AbortController;
  done: Promise<void>;
  running: boolean;
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
  const lanes = new Map<string, Task>();
  const all = new Set<Task>();
  let active = true;
  const guardedDispatch = (msg: M): void => {
    if (active) dispatch(msg);
  };

  const start = (
    lane: string,
    driver: AnyDriver,
    cmd: Command<M>,
    report: Report,
    after?: Task,
  ): void => {
    const controller = new AbortController();
    const task: Task = { controller, running: true, done: Promise.resolve() };
    const body = async (): Promise<void> => {
      if (after !== undefined) await after.done;
      if (!controller.signal.aborted) {
        await execute(driver, cmd, controller.signal, guardedDispatch, report);
      }
    };
    task.done = body().finally(() => {
      task.running = false;
      all.delete(task);
      if (lanes.get(lane) === task) lanes.delete(lane);
    });
    lanes.set(lane, task);
    all.add(task);
  };

  const run = (cmd: Command<M>): void => {
    if (!active) return;
    const driver = resolve(cmd.driver);
    const lane = cmd.key ?? driver.name;
    const policy = cmd.concurrency ?? driver.concurrency ?? 'merge';
    const previous = lanes.get(lane);
    const inFlight = previous?.running === true ? previous : undefined;
    const report = DEVTOOLS_ENABLED ? reporter(driver.name, lane, policy, cmd.input) : undefined;
    if (inFlight !== undefined && policy === 'exhaust') {
      if (DEVTOOLS_ENABLED) report?.('dropped');
      return;
    }
    if (DEVTOOLS_ENABLED) report?.('issued');
    if (inFlight !== undefined && policy === 'switch') inFlight.controller.abort();
    start(
      lane,
      driver,
      cmd,
      report,
      inFlight !== undefined && policy === 'queue' ? inFlight : undefined,
    );
  };

  const dispose = (): void => {
    active = false;
    for (const task of all) task.controller.abort();
    all.clear();
    lanes.clear();
  };

  return { run, dispose };
}

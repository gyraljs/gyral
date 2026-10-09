import { DEVTOOLS_ENABLED } from '#devtools';
import type { AnyDriver, Command, Concurrency, DriverOverrides } from '../command.js';
import type { CommandPhase, CommandTrace } from '../devtools-events.js';
import { providedDriver } from '../drivers-scope.js';
import type { FeatureHost } from '../features.js';

// The command interpreter (ADR 0015: hand-written, no runtime dependencies). Each running command is a task with its own AbortController; lanes hold the
// latest task per key. Interruption is `controller.abort()`,
// and `queue` chains on the previous task's promise. A driver runs once: retries are a driver
// wrapper (retry.ts, ADR 0022).

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

/**
 * Reports a failure to the owner (ADR 0024): `40` a mapper threw, `41` a driver failed and the
 * command has no `onFailure`. The owner builds the message and reports it.
 */
export type CommandFailure = (cause: unknown, code: 40 | 41, driver: string) => void;

/** Rejects when `signal` aborts. Marked handled so a losing race never reports it. */
const aborted = (signal: AbortSignal): Promise<never> => {
  const promise = new Promise<never>((_resolve, reject) => {
    // Callers check `signal.aborted`, never the reason.
    const interrupt = (): void => {
      reject(signal.reason as Error);
    };
    if (signal.aborted) interrupt();
    else signal.addEventListener('abort', interrupt, { once: true });
  });
  promise.catch(() => undefined);
  return promise;
};

/** Runs the driver once; an abort settles it at once, even if the driver ignores the signal. */
const attempt = (
  driver: AnyDriver,
  cmd: Command<unknown>,
  signal: AbortSignal,
  emit: (output: unknown) => void,
): Promise<unknown> =>
  // The input type was erased by command(); it was built for this driver's name.
  Promise.race([
    Promise.resolve(driver.run(cmd.input as never, { signal, emit })),
    aborted(signal),
  ]);

/**
 * Maps a result to a message and dispatches it. A throwing mapper is reported (ADR 0024) and
 * sends nothing; the reducer's own failures are the owner's (dispatch reports them).
 */
const deliver = <M>(
  map: () => M | undefined,
  dispatch: (msg: M) => void,
  failed: CommandFailure,
  driver: string,
): void => {
  let msg: M | undefined;
  try {
    msg = map();
  } catch (defect) {
    failed(defect, 40, driver);
    return;
  }
  if (msg !== undefined) dispatch(msg);
};

async function execute<M>(
  driver: AnyDriver,
  cmd: Command<M>,
  signal: AbortSignal,
  dispatch: (msg: M) => void,
  report: Report,
  failed: CommandFailure,
): Promise<void> {
  let settled = false;
  const name = driver.name;
  const emit = (output: unknown): void => {
    if (!settled && !signal.aborted) deliver(() => cmd.onSuccess(output), dispatch, failed, name);
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
    output = await attempt(driver, cmd, signal, emit);
  } catch (cause) {
    if (signal.aborted) return; // interrupted: reported by the abort listener
    settled = true;
    const error = driver.toError === undefined ? cause : driver.toError(cause);
    if (DEVTOOLS_ENABLED) report?.('failed', error);
    if (cmd.onFailure === undefined) {
      failed(error, 41, name);
      return;
    }
    const onFailure = cmd.onFailure;
    deliver(() => onFailure(error), dispatch, failed, name);
    return;
  }
  if (signal.aborted) return;
  settled = true;
  if (DEVTOOLS_ENABLED) report?.('settled', output);
  deliver(() => cmd.onSuccess(output), dispatch, failed, name);
}

export function makeInterpreter<M>(
  resolve: (driver: AnyDriver) => AnyDriver,
  dispatch: (msg: M) => void,
  trace: CommandTrace | undefined,
  failed: CommandFailure,
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
        await execute(driver, cmd, controller.signal, guardedDispatch, report, failed);
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

/**
 * A component's interpreter (registered by `command()`, features.ts). Drivers resolve by name:
 * el.drivers → nearest provider → spec.drivers → the command's own (gyral-czi.35).
 */
export const hostInterpreter = <M>(
  el: FeatureHost,
  drivers: DriverOverrides | undefined,
  dispatch: (msg: M) => void,
  trace: CommandTrace | undefined,
  failed: CommandFailure,
): Interpreter<M> =>
  makeInterpreter(
    (driver) =>
      el.drivers[driver.name] ??
      providedDriver(el, driver.name) ??
      drivers?.[driver.name] ??
      driver,
    dispatch,
    trace,
    failed,
  );

import { Data, Duration, Effect, Fiber, Schedule } from 'effect';
import type { AnyDriver, Command, RetryPolicy } from '../command.js';
import { fork } from './runtime.js';

class DriverFailure extends Data.TaggedError('DriverFailure')<{ readonly cause: unknown }> {}

type Running = Fiber.RuntimeFiber<void>;

/** Runs commands for one connected element. Disposed on disconnect. */
export interface Interpreter<M> {
  readonly run: (cmd: Command<M>) => void;
  readonly dispose: () => void;
}

const isRunning = (fiber: Running | undefined): fiber is Running =>
  fiber !== undefined && fiber.unsafePoll() === null;

const withRetry = <A>(
  attempt: Effect.Effect<A, DriverFailure>,
  policy: RetryPolicy | undefined,
): Effect.Effect<A, DriverFailure> => {
  if (policy === undefined || policy.times <= 0) return attempt;
  const base = Duration.millis(policy.delayMs ?? 0);
  const delays: Schedule.Schedule<unknown> =
    policy.backoff === 'exponential' ? Schedule.exponential(base) : Schedule.spaced(base);
  return Effect.retry(attempt, delays.pipe(Schedule.intersect(Schedule.recurs(policy.times))));
};

const execute = <M>(
  driver: AnyDriver,
  cmd: Command<M>,
  dispatch: (msg: M) => void,
): Effect.Effect<void> => {
  const deliver = (output: unknown): void => {
    try {
      const msg = cmd.onSuccess(output);
      if (msg !== undefined) dispatch(msg);
    } catch (defect) {
      console.error('gyral: command mapper threw', defect);
    }
  };
  const attempt = Effect.tryPromise({
    try: (signal) => {
      let settled = false;
      const emit = (output: unknown): void => {
        if (!settled && !signal.aborted) deliver(output);
      };
      // The input type was erased by command(); it was built for this driver's name.
      const result = Promise.resolve(driver.run(cmd.input as never, { signal, emit }));
      return result.finally(() => {
        settled = true;
      });
    },
    catch: (cause) => new DriverFailure({ cause }),
  });
  return withRetry(attempt, driver.retry).pipe(
    Effect.matchEffect({
      onSuccess: (output) => Effect.succeed(cmd.onSuccess(output)),
      onFailure: (failure) => {
        const error = driver.toError === undefined ? failure.cause : driver.toError(failure.cause);
        return cmd.onFailure === undefined
          ? Effect.logWarning(`gyral: unhandled failure from driver "${driver.name}"`, error).pipe(
              Effect.as(undefined),
            )
          : Effect.succeed(cmd.onFailure(error));
      },
    }),
    Effect.flatMap((msg) =>
      Effect.sync(() => {
        if (msg !== undefined) dispatch(msg);
      }),
    ),
    Effect.catchAllDefect((defect) => Effect.logError('gyral: command mapper threw', defect)),
  );
};

export function makeInterpreter<M>(
  resolve: (driver: AnyDriver) => AnyDriver,
  dispatch: (msg: M) => void,
): Interpreter<M> {
  const lanes = new Map<string, Running>();
  const all = new Set<Running>();
  let active = true;
  const guardedDispatch = (msg: M): void => {
    if (active) dispatch(msg);
  };

  const track = (lane: string, fiber: Running): void => {
    if (!isRunning(fiber)) return;
    lanes.set(lane, fiber);
    all.add(fiber);
    fiber.addObserver(() => {
      all.delete(fiber);
      if (lanes.get(lane) === fiber) lanes.delete(lane);
    });
  };

  const run = (cmd: Command<M>): void => {
    if (!active) return;
    const driver = resolve(cmd.driver);
    const lane = cmd.key ?? driver.name;
    const policy = cmd.concurrency ?? driver.concurrency ?? 'merge';
    const previous = lanes.get(lane);
    const inFlight = isRunning(previous) ? previous : undefined;
    let program = execute(driver, cmd, guardedDispatch);
    if (inFlight !== undefined) {
      if (policy === 'exhaust') return;
      if (policy === 'switch') program = Effect.zipRight(Fiber.interrupt(inFlight), program);
      if (policy === 'queue') program = Effect.zipRight(Fiber.await(inFlight), program);
    }
    track(lane, fork(program));
  };

  const dispose = (): void => {
    active = false;
    fork(Fiber.interruptAll([...all]));
    all.clear();
    lanes.clear();
  };

  return { run, dispose };
}

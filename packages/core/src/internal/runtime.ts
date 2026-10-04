import { Effect, type Fiber } from 'effect';

/**
 * The single place Gyral starts Effect programs (ADR 0006). There are no services to
 * provide yet, so the default runtime is enough; a ManagedRuntime with layers goes here
 * when drivers need shared resources.
 */
export const fork = <A>(program: Effect.Effect<A>): Fiber.RuntimeFiber<A> =>
  Effect.runFork(program);

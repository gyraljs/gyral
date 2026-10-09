// Effects as data (docs/design-docs/0006-effects-and-drivers.md). Plain TypeScript only: the
// interpreter lives in ./internal/ (ADR 0015); `command()` registers it (features.ts), so apps
// that build no commands don't bundle it.
import { features } from './features.js';
import { hostInterpreter } from './internal/interpreter.js';
import { unprovided } from './internal/token.js';
import type { IntentRejected } from './types.js';

/** How commands in the same lane interact. See ADR 0006 for the table. */
export type Concurrency = 'merge' | 'switch' | 'exhaust' | 'queue';

/** How `retry(driver, policy)` retries a rejected run (retry.ts). `E`: the driver's error. */
export interface RetryPolicy<E = unknown> {
  /** Retries after the first failure. */
  readonly times: number;
  /** Delay before each retry (the base delay for exponential backoff). Default 0. */
  readonly delayMs?: number;
  readonly backoff?: 'fixed' | 'exponential';
  /** Full jitter: wait a random time between 0 and the computed delay, so clients spread out. */
  readonly jitter?: boolean;
  /**
   * Which failures to retry, given the driver's typed error (its `toError`, else the thrown
   * value). Default: every failure. For `@gyral/http`, `retryableHttpError`.
   */
  readonly retryIf?: (error: E) => boolean;
}

export interface DriverContext<O = unknown> {
  /** Aborts when the command is switched away or its component disconnects. */
  readonly signal: AbortSignal;
  /**
   * Delivers an extra result while the command runs (streaming drivers: routers, timers,
   * sockets). Each value goes through the command's `onSuccess`. Ignored once the command
   * has settled or been aborted. A streaming `run` usually never resolves; abort ends it.
   */
  readonly emit: (output: O) => void;
}

/** Performs one kind of side effect. A plain object: easy to fake in tests. */
export interface Driver<I, O, E = unknown> {
  readonly name: string;
  readonly run: (input: I, ctx: DriverContext<O>) => O | Promise<O>;
  /** Default policy for this driver's commands. Default `'merge'`. */
  readonly concurrency?: Concurrency;
  /** Turns a thrown or rejected value into this driver's typed error. */
  readonly toError?: (cause: unknown) => E;
}

/**
 * Any driver, with its input type erased. Every `Driver<I, O, E>` (from `defineDriver`,
 * `subscription`, a test fake) is assignable to it as is: no cast.
 */
export type AnyDriver = Driver<never, unknown>;

/**
 * A driver with no implementation of its own (`defineDriver<I, O, E>('session')`): commands built
 * from it are typed by `I`, `O` and `E`, and it runs only when `provideDrivers` or `el.drivers`
 * supplies a driver of that name (ADR 0006 addendum "Driver tokens").
 */
export interface DriverToken<E = unknown> {
  readonly name: string;
  readonly concurrency?: Concurrency;
  readonly toError?: (cause: unknown) => E;
}

/**
 * Drivers substituted by name (test fakes, configured instances): `el.drivers`,
 * `provideDrivers`. Annotate a driver map with this type (or `Record<string, AnyDriver>`), not
 * `Record<string, Driver<unknown, unknown>>`, which rejects drivers with a typed input.
 */
export type DriverOverrides = Readonly<Record<string, AnyDriver>>;

/**
 * A side effect described as data, plus pure mappers from its outcome to messages. Commands
 * that answer with no message (`focus()`, `emit()`, `navigate()`, `go()`) are `Command<never>`,
 * which fits wherever a `Command<Msg>` is expected: no type argument needed.
 */
export interface Command<M> {
  readonly driver: AnyDriver;
  readonly input: unknown;
  /** Concurrency lane. Default: the driver's name. */
  readonly key?: string;
  readonly concurrency?: Concurrency;
  readonly onSuccess: (output: unknown) => M | undefined;
  /** If omitted, a failure is reported to the error channel (ADR 0024, G0041). */
  readonly onFailure?: (error: unknown) => M | undefined;
}

/**
 * How a command's outcome becomes a message. Every field is optional: without `onSuccess` the
 * command answers with nothing (`Command<never>`); without `onFailure` a failure is reported to
 * the error channel (ADR 0024).
 */
export interface CommandHandlers<O, E, MS, MF = MS> {
  readonly onSuccess?: (output: O) => MS | undefined;
  readonly onFailure?: (error: E) => MF | undefined;
  readonly key?: string;
  readonly concurrency?: Concurrency;
}

/**
 * What a reducer (or `init`) returns: new state, optionally with commands to run. Commands may
 * also answer with the framework message `IntentRejected` (e.g. `submitForm` in `@gyral/http`
 * when the server rejects a form), which goes to the optional `IntentRejected` reducer.
 */
export type Next<S, M> = S | readonly [S, ReadonlyArray<Command<M | IntentRejected>>];

/**
 * Defines a driver. Given an implementation (`run`), it returns it as is, so literals infer
 * `I`, `O` and `E`. Given only a name, it returns a typed **token**: commands built from it are
 * typed, and it runs only when a provider (`provideDrivers`) or `el.drivers` supplies a driver of
 * that name. A command whose token nothing provides fails with G0043, naming the driver.
 */
export function defineDriver<I, O, E = unknown>(
  spec: Driver<I, O, E> | DriverToken<E> | string,
): Driver<I, O, E> {
  if (typeof spec === 'string') return { name: spec, run: unprovided };
  return 'run' in spec ? spec : { ...spec, run: unprovided };
}

const none = (): undefined => undefined;

/**
 * Builds a command whose mappers are typed by the driver's input, output and error. Without
 * handlers (or without `onSuccess`) it answers with no message: `command(log, line)` is a
 * `Command<never>`, which fits any `Command<Msg>`.
 */
// Two message parameters so success and failure may produce different variants; `const` keeps
// a mapper's `{ _tag: 'Loaded' }` literal, so no type arguments are needed.
export function command<I, O, E, const MS = never, const MF = MS>(
  driver: Driver<I, O, E>,
  input: I,
  handlers: CommandHandlers<O, E, MS, MF> = {},
): Command<MS | MF> {
  features.commands = hostInterpreter;
  const { onSuccess = none, onFailure, key, concurrency } = handlers;
  // Sound: the interpreter only passes this driver's output and toError() result.
  return {
    driver,
    input,
    onSuccess,
    ...(onFailure && { onFailure }),
    ...(key === undefined ? {} : { key }),
    ...(concurrency === undefined ? {} : { concurrency }),
  } as Command<MS | MF>;
}

/** Splits a reducer result into state and commands. State is never an array (ADR 0006). */
export function splitNext<S, M>(
  next: Next<S, M>,
): readonly [S, ReadonlyArray<Command<M | IntentRejected>>] {
  if (Array.isArray(next) && next.length === 2 && Array.isArray(next[1])) {
    return next as readonly [S, ReadonlyArray<Command<M | IntentRejected>>];
  }
  return [next as S, []];
}

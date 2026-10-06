// Effects as data (docs/design-docs/0006-effects-and-drivers.md). Plain TypeScript only:
import type { IntentRejected } from './types.js';
// the interpreter lives in ./internal/ (ADR 0015).

/** How commands in the same lane interact. See ADR 0006 for the table. */
export type Concurrency = 'merge' | 'switch' | 'exhaust' | 'queue';

export interface RetryPolicy {
  /** Retries after the first failure. */
  readonly times: number;
  /** Delay before each retry (the base delay for exponential backoff). Default 0. */
  readonly delayMs?: number;
  readonly backoff?: 'fixed' | 'exponential';
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
  readonly retry?: RetryPolicy;
  /** Turns a thrown or rejected value into this driver's typed error. */
  readonly toError?: (cause: unknown) => E;
}

/** Any driver, with its input type erased. */
export type AnyDriver = Driver<never, unknown>;

/** Drivers substituted by name (test fakes, configured instances). */
export type DriverOverrides = Readonly<Record<string, AnyDriver>>;

/** A side effect described as data, plus pure mappers from its outcome to messages. */
export interface Command<M> {
  readonly driver: AnyDriver;
  readonly input: unknown;
  /** Concurrency lane. Default: the driver's name. */
  readonly key?: string;
  readonly concurrency?: Concurrency;
  readonly onSuccess: (output: unknown) => M | undefined;
  /** If omitted, failures are logged and dropped. */
  readonly onFailure?: (error: unknown) => M | undefined;
}

export interface CommandHandlers<O, E, MS, MF = MS> {
  readonly onSuccess: (output: O) => MS | undefined;
  readonly onFailure?: (error: E) => MF | undefined;
  readonly key?: string;
  readonly concurrency?: Concurrency;
}

/**
 * What a reducer (or `init`) returns: new state, optionally with commands to run. Commands may
 * also answer with the framework message `IntentRejected` (e.g. `submitForm` in @gyral/http
 * when the server rejects a form), which goes to the optional `IntentRejected` reducer.
 */
export type Next<S, M> = S | readonly [S, ReadonlyArray<Command<M | IntentRejected>>];

/** Identity helper so driver literals infer `I`, `O` and `E`. */
export function defineDriver<I, O, E = unknown>(driver: Driver<I, O, E>): Driver<I, O, E> {
  return driver;
}

/** Builds a command whose mappers are typed by the driver's input, output and error. */
// Two message parameters so success and failure may produce different variants.
export function command<I, O, E, MS, MF = MS>(
  driver: Driver<I, O, E>,
  input: I,
  handlers: CommandHandlers<O, E, MS, MF>,
): Command<MS | MF> {
  const { onFailure, key, concurrency } = handlers;
  return {
    driver: driver,
    input,
    // Sound: the interpreter only passes this driver's output and toError() result.
    onSuccess: (output) => handlers.onSuccess(output as O),
    ...(onFailure === undefined ? {} : { onFailure: (error: unknown) => onFailure(error as E) }),
    ...(key === undefined ? {} : { key }),
    ...(concurrency === undefined ? {} : { concurrency }),
  };
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

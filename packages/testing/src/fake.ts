import type { Concurrency, Driver, DriverContext, RetryPolicy } from '@gyral/core';

/** One recorded `run` of a fake driver. */
export interface FakeCall<I, O> {
  readonly input: I;
  readonly signal: AbortSignal;
  /** Settles this call (only for fakes without `impl`). */
  readonly resolve: (output: O) => void;
  readonly reject: (error: unknown) => void;
  readonly settled: boolean;
}

export interface FakeDriver<I, O, E> extends Driver<I, O, E> {
  readonly calls: ReadonlyArray<FakeCall<I, O>>;
  /** Inputs of every call so far. */
  readonly inputs: readonly I[];
  /** Settles the oldest unsettled, non-aborted call. Throws if there is none. */
  resolveNext(output: O): void;
  rejectNext(error: unknown): void;
}

export interface FakeOptions<I, O, E> {
  /** Answer calls immediately. Without it, calls wait for `resolveNext`/`rejectNext`. */
  readonly impl?: (input: I, ctx: DriverContext<O>) => O | Promise<O>;
  readonly concurrency?: Concurrency;
  readonly retry?: RetryPolicy;
  readonly toError?: (cause: unknown) => E;
}

interface MutableCall<I, O> extends FakeCall<I, O> {
  settled: boolean;
}

function noop(): void {
  // Calls answered by `impl` cannot be settled again.
}

/**
 * A recording driver for DOM-level tests: `el.drivers = { http: fakeDriver(http) }`.
 * Pass a real driver to copy its name and concurrency, or just a name. Failures pass
 * through unchanged unless you give `toError`, so `rejectNext(error)` takes the typed error.
 */
export function fakeDriver<I = unknown, O = unknown, E = unknown>(
  of: string | Driver<I, O, E>,
  options: FakeOptions<I, O, E> = {},
): FakeDriver<I, O, E> {
  const name = typeof of === 'string' ? of : of.name;
  const concurrency = options.concurrency ?? (typeof of === 'string' ? undefined : of.concurrency);
  const calls: MutableCall<I, O>[] = [];

  const next = (): MutableCall<I, O> => {
    const call = calls.find((c) => !c.settled && !c.signal.aborted);
    if (call === undefined) throw new Error(`fake driver "${name}" has no pending call`);
    return call;
  };

  const run = (input: I, ctx: DriverContext<O>): O | Promise<O> => {
    const { impl } = options;
    if (impl !== undefined) {
      calls.push({ input, signal: ctx.signal, resolve: noop, reject: noop, settled: true });
      return impl(input, ctx);
    }
    return new Promise<O>((resolveRun, rejectRun) => {
      const call: MutableCall<I, O> = {
        input,
        signal: ctx.signal,
        settled: false,
        resolve: (output) => {
          call.settled = true;
          resolveRun(output);
        },
        reject: (error) => {
          call.settled = true;
          // Deliberately not an Error: fakes reject with the driver's typed error (e.g. a
          // tagged HttpError), which reaches onFailure unchanged when there is no toError.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          rejectRun(error);
        },
      };
      calls.push(call);
    });
  };

  return {
    name,
    run,
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(options.toError === undefined ? {} : { toError: options.toError }),
    calls,
    get inputs() {
      return calls.map((c) => c.input);
    },
    resolveNext: (output) => {
      next().resolve(output);
    },
    rejectNext: (error) => {
      next().reject(error);
    },
  };
}

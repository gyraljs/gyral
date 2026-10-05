// A fake http driver for tests that decodes exactly like the real one (gyral-czi.36): it IS the
// real driver (`makeHttpDriver`) with a controllable `fetch`, so a request's `schema` and
// `errorSchema`, status errors and JSON parsing all behave as in production. Wrong fake data
// becomes an `HttpDecodeError` (the component's onFailure), never a crash in the view.
// Lives here, not in @gyral/testing, because layer-1 packages may not import each other.
import type { Concurrency, Driver, DriverContext, RetryPolicy } from '@gyral/core';
import { makeHttpDriver, type HeaderSource, type HttpError, type HttpRequest } from './driver.js';

/** What a fake server answers: a status (default 200) and a JSON body (omit for none). */
export interface FakeResponse {
  readonly status?: number;
  readonly statusText?: string;
  readonly body?: unknown;
}

/** One request the fake driver received. */
export interface FakeHttpCall {
  readonly request: HttpRequest;
  readonly signal: AbortSignal;
  readonly settled: boolean;
  /** Answers this request; the real driver then decodes it. */
  readonly respond: (response?: FakeResponse) => void;
  /** Fails this request as a network error (`HttpNetworkError`). */
  readonly fail: (message?: string) => void;
}

export interface FakeHttp extends Driver<HttpRequest, unknown, HttpError> {
  readonly calls: readonly FakeHttpCall[];
  /** Every request so far. */
  readonly requests: readonly HttpRequest[];
  /** Same as `requests`; matches `fakeDriver(…).inputs` from @gyral/testing. */
  readonly inputs: readonly HttpRequest[];
  /** Errors thrown (or rejected) by the `respond` option, in order. */
  readonly responderErrors: readonly unknown[];
  /** Answers the oldest request that is still waiting. Throws if there is none. */
  respondNext(response?: FakeResponse): void;
  /** Shorthand for `respondNext({ status, body })`, e.g. `reply(422, problem)`. */
  reply(status: number, body?: unknown): void;
  /** Fails the oldest waiting request as a network error. Throws if there is none. */
  failNext(message?: string): void;
}

export interface FakeHttpOptions {
  /** Driver name to substitute (`el.drivers`, providers). Default `'http'`. */
  readonly name?: string;
  /** Answer every request immediately. Without it, requests wait for `respondNext`. */
  readonly respond?: (request: HttpRequest) => FakeResponse | Promise<FakeResponse>;
  /** Base URL for relative request URLs. Default `'http://localhost/'`. */
  readonly baseUrl?: string;
  readonly headers?: HeaderSource;
  readonly concurrency?: Concurrency;
  readonly retry?: RetryPolicy;
  /**
   * Called when the `respond` option throws or rejects. That is a bug in the test, not a
   * network failure, so by default it is rethrown as an uncaught error (Vitest fails the run).
   * The request itself still fails (as `HttpNetworkError`) so the component never hangs.
   */
  readonly onResponderError?: (error: unknown, request: HttpRequest) => void;
}

/** The error a fake request fails with when the `respond` option threw. */
export class FakeHttpResponderError extends Error {
  constructor(
    readonly request: HttpRequest,
    cause: unknown,
  ) {
    super(`fakeHttp: the respond option threw for ${request.url}: ${String(cause)}`, { cause });
    this.name = 'FakeHttpResponderError';
  }
}

const rethrowLater = (error: unknown): void => {
  setTimeout(() => {
    throw error;
  }, 0);
};

interface MutableCall extends FakeHttpCall {
  settled: boolean;
}

const NO_BODY = new Set([204, 205, 304]);

function toResponse({ status = 200, statusText = '', body }: FakeResponse = {}): Response {
  const text = body === undefined || NO_BODY.has(status) ? null : JSON.stringify(body);
  const headers = text === null ? undefined : { 'content-type': 'application/json' };
  return new Response(text, { status, statusText, ...(headers === undefined ? {} : { headers }) });
}

/**
 * `el.drivers = { http: fakeHttp() }` (or `withDrivers(root, { http })`), then
 * `http.respondNext({ body })` or `http.reply(422, problem)`. Request inputs are recorded in
 * `requests` (alias `inputs`).
 */
export function fakeHttp(options: FakeHttpOptions = {}): FakeHttp {
  const calls: MutableCall[] = [];
  const responderErrors: unknown[] = [];
  // The request whose fetch is being made. makeHttpDriver calls fetch synchronously within
  // run(), before its first await, so this hand-off cannot interleave.
  let current: HttpRequest | undefined;

  const fetchFake = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = current;
    current = undefined;
    if (request === undefined) throw new Error('fakeHttp: fetch called outside a request');
    const signal = init?.signal ?? new AbortController().signal;
    if (options.respond !== undefined) {
      calls.push({ request, signal, settled: true, respond: noop, fail: noop });
      const responder = options.respond;
      return new Promise<FakeResponse>((resolve) => {
        resolve(responder(request));
      }).then(toResponse, (cause: unknown) => {
        const error = new FakeHttpResponderError(request, cause);
        responderErrors.push(cause);
        (options.onResponderError ?? rethrowLater)(error, request);
        throw new TypeError(error.message); // the driver reports it as HttpNetworkError
      });
    }
    return new Promise<Response>((resolve, reject) => {
      const call: MutableCall = {
        request,
        signal,
        settled: false,
        respond: (response) => {
          if (call.settled) return;
          call.settled = true;
          resolve(toResponse(response));
        },
        fail: (message = 'fake network error') => {
          if (call.settled) return;
          call.settled = true;
          reject(new TypeError(message));
        },
      };
      signal.addEventListener(
        'abort',
        () => {
          if (call.settled) return;
          call.settled = true;
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
      calls.push(call);
    });
  };

  const real = makeHttpDriver({
    name: options.name ?? 'http',
    baseUrl: options.baseUrl ?? 'http://localhost/',
    fetch: fetchFake,
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
  });

  const waiting = (): MutableCall => {
    const call = calls.find((c) => !c.settled && !c.signal.aborted);
    if (call === undefined) throw new Error(`fakeHttp "${real.name}" has no waiting request`);
    return call;
  };

  return {
    ...real,
    run: (request: HttpRequest, ctx: DriverContext) => {
      current = request;
      return real.run(request, ctx);
    },
    calls,
    get requests() {
      return calls.map((c) => c.request);
    },
    get inputs() {
      return calls.map((c) => c.request);
    },
    responderErrors,
    respondNext: (response) => {
      waiting().respond(response);
    },
    reply: (status, body) => {
      waiting().respond(body === undefined ? { status } : { status, body });
    },
    failNext: (message) => {
      waiting().fail(message);
    },
  };
}

function noop(): void {
  // Calls answered by `respond` cannot be settled again.
}

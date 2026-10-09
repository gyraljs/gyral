import { type Concurrency, type Driver } from '@gyral/core';
import { devtoolsEnabled as DEV } from '@gyral/core/internal';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** An HTTP request described as data. */
export interface HttpRequest {
  readonly url: string;
  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sent as JSON, except `FormData` and `URLSearchParams`, which are sent as forms. */
  readonly body?: unknown;
  /** Decodes the JSON response. Any Standard Schema library works (Zod, Valibot, Effect…). */
  readonly schema?: StandardSchemaV1;
  /**
   * Decodes the body of a non-2xx response into `HttpStatusError.detail` (for example a 422
   * `IntentRejected`). A body that doesn't match leaves `detail` unset; `body` is always kept.
   */
  readonly errorSchema?: StandardSchemaV1;
}

/** Every way a request can fail. Delivered to `onFailure`, never thrown into the view. */
export type HttpError =
  | {
      readonly _tag: 'HttpStatusError';
      readonly url: string;
      readonly status: number;
      readonly statusText: string;
      /** The response body: parsed JSON, or text, or `undefined` when empty. */
      readonly body: unknown;
      /** `body` decoded by the request's `errorSchema`, when it was given and matched. */
      readonly detail?: unknown;
    }
  | { readonly _tag: 'HttpNetworkError'; readonly url: string; readonly message: string }
  /** The attempt took longer than the driver's `timeoutMs`. */
  | { readonly _tag: 'HttpTimeoutError'; readonly url: string; readonly timeoutMs: number }
  | {
      readonly _tag: 'HttpDecodeError';
      readonly url: string;
      readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;
    };

/** Headers as data, or computed when each request runs (e.g. read a CSRF `<meta>`). */
export type HeaderSource =
  | Readonly<Record<string, string>>
  | ((req: HttpRequest) => Readonly<Record<string, string>> | undefined);

export interface HttpDriverOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'http'`. */
  readonly name?: string;
  /**
   * Default headers for every request through this driver: app-level concerns such as a CSRF
   * token or an API key, so components and stores never read the DOM themselves. This is the
   * one place a CSRF token is configured (ADR 0022). Per-request `headers` win over these.
   *
   *   provideDrivers(document.body, { http: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) });
   */
  readonly headers?: HeaderSource;
  /** Resolves relative URLs. Default: the document location. */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly concurrency?: Concurrency;
  /**
   * Aborts a request that takes longer than this, failing with `HttpTimeoutError`. Applies per
   * attempt: under `retry(…)` each attempt gets the full time. Default: no limit.
   */
  readonly timeoutMs?: number;
  // No retry option: wrap the driver instead, `retry(makeHttpDriver(…), policy)` (ADR 0022).
}

/** Carries a typed HttpError through the driver's rejection path. */
class HttpFailure extends Error {
  constructor(readonly error: HttpError) {
    super(error._tag);
  }
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const isFormBody = (body: unknown): body is FormData | URLSearchParams =>
  body instanceof FormData || body instanceof URLSearchParams;

/** Parsed JSON when the text is JSON, else the text itself; `undefined` when empty. */
const parseLoose = (text: string): unknown => {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/**
 * A header source that reads a token from `<meta name=…>` when each request runs. On the
 * server, or when the meta is missing, it adds nothing. The header defaults to `x-csrf-token`.
 */
export function csrfFromMeta(
  meta: string,
  header = 'x-csrf-token',
): () => Readonly<Record<string, string>> {
  return () => {
    if (typeof document === 'undefined') return {};
    const token = document.querySelector(`meta[name="${meta}"]`)?.getAttribute('content');
    return token == null ? {} : { [header]: token };
  };
}

let warned = false;

/**
 * Development only: warns once when a non-GET request goes out while the page carries a CSRF
 * `<meta>` whose token no header carries (the driver has no `csrfFromMeta` header source).
 */
const checkToken = (method: string, headers: Readonly<Record<string, string>>): void => {
  if (warned || method === 'GET' || typeof document === 'undefined') return;
  const token = document
    .querySelector('meta[name="csrf-token"],meta[name="csrf"]')
    ?.getAttribute('content');
  if (token == null || Object.values(headers).includes(token)) return;
  warned = true;
  console.warn(
    `Gyral http: a ${method} request carries no CSRF token, but the page has a CSRF <meta>. ` +
      "Give the driver a header source: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }).",
  );
};

const resolveHeaders = (
  source: HeaderSource | undefined,
  req: HttpRequest,
): Readonly<Record<string, string>> => (typeof source === 'function' ? source(req) : source) ?? {};

async function statusError(
  url: string,
  response: Response,
  errorSchema: StandardSchemaV1 | undefined,
): Promise<HttpError> {
  const { status, statusText } = response;
  const body = parseLoose(await response.text().catch(() => ''));
  const base = { _tag: 'HttpStatusError', url, status, statusText, body } as const;
  if (errorSchema === undefined) return base;
  const result = await errorSchema['~standard'].validate(body);
  return result.issues === undefined ? { ...base, detail: result.value } : base;
}

export function makeHttpDriver(
  options: HttpDriverOptions = {},
): Driver<HttpRequest, unknown, HttpError> {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));

  const urlOf = (req: HttpRequest): string =>
    new URL(req.url, options.baseUrl ?? location.href).href;

  const attempt = async (
    req: HttpRequest,
    { signal }: { signal: AbortSignal },
  ): Promise<unknown> => {
    const url = urlOf(req);
    const { body: payload } = req;
    const asJson = payload !== undefined && !isFormBody(payload);
    const method = req.method ?? 'GET';
    const headers = {
      accept: 'application/json',
      // Form bodies set their own content type (with the multipart boundary).
      ...(asJson ? { 'content-type': 'application/json' } : {}),
      ...resolveHeaders(options.headers, req),
      ...req.headers,
    };
    if (DEV) checkToken(method, headers);
    const init: RequestInit = {
      method,
      signal,
      headers,
      ...(payload === undefined ? {} : { body: asJson ? JSON.stringify(payload) : payload }),
    };
    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (cause) {
      throw new HttpFailure({ _tag: 'HttpNetworkError', url, message: messageOf(cause) });
    }
    if (!response.ok) throw new HttpFailure(await statusError(url, response, req.errorSchema));
    const text = await response.text();
    let body: unknown;
    try {
      body = text === '' ? undefined : JSON.parse(text);
    } catch (cause) {
      throw new HttpFailure({
        _tag: 'HttpDecodeError',
        url,
        issues: [{ message: messageOf(cause) }],
      });
    }
    if (req.schema === undefined) return body;
    const result = await req.schema['~standard'].validate(body);
    if (result.issues !== undefined) {
      throw new HttpFailure({ _tag: 'HttpDecodeError', url, issues: result.issues });
    }
    return result.value;
  };

  const { timeoutMs } = options;
  // A timer, not AbortSignal.timeout(), so fake timers in tests control it.
  const run =
    timeoutMs === undefined
      ? attempt
      : async (req: HttpRequest, { signal }: { signal: AbortSignal }): Promise<unknown> => {
          const timer = new AbortController();
          const id = setTimeout(() => {
            timer.abort();
          }, timeoutMs);
          try {
            return await attempt(req, { signal: AbortSignal.any([signal, timer.signal]) });
          } catch (cause) {
            throw timer.signal.aborted && !signal.aborted
              ? new HttpFailure({ _tag: 'HttpTimeoutError', url: urlOf(req), timeoutMs })
              : cause;
          } finally {
            clearTimeout(id);
          }
        };

  return {
    name: options.name ?? 'http',
    run,
    toError: (cause) =>
      cause instanceof HttpFailure
        ? cause.error
        : { _tag: 'HttpNetworkError', url: '', message: messageOf(cause) },
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  };
}

/**
 * The failures worth retrying: network errors, timeouts, 408, 429 and 5xx. Pass it as
 * `retry(…, { retryIf: retryableHttpError })`. A 4xx other than 408/429 means the request
 * itself is wrong, and decoding errors won't change on a retry. `Retry-After` isn't read.
 */
export const retryableHttpError = (error: HttpError): boolean =>
  error._tag === 'HttpNetworkError' ||
  error._tag === 'HttpTimeoutError' ||
  (error._tag === 'HttpStatusError' &&
    (error.status >= 500 || error.status === 408 || error.status === 429));

/** The default driver. Substitute it by name: `el.drivers = { http: makeHttpDriver({...}) }`. */
export const http = makeHttpDriver();

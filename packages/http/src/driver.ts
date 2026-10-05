import type { Concurrency, Driver, RetryPolicy } from '@gyral/core';
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
  | {
      readonly _tag: 'HttpDecodeError';
      readonly url: string;
      readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;
    };

export interface HttpDriverOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'http'`. */
  readonly name?: string;
  /** Resolves relative URLs. Default: the document location. */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly concurrency?: Concurrency;
  readonly retry?: RetryPolicy;
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

  const run = async (req: HttpRequest, { signal }: { signal: AbortSignal }): Promise<unknown> => {
    const url = new URL(req.url, options.baseUrl ?? location.href).href;
    const { body: payload } = req;
    const asJson = payload !== undefined && !isFormBody(payload);
    const init: RequestInit = {
      method: req.method ?? 'GET',
      signal,
      headers: {
        accept: 'application/json',
        // Form bodies set their own content type (with the multipart boundary).
        ...(asJson ? { 'content-type': 'application/json' } : {}),
        ...req.headers,
      },
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

  return {
    name: options.name ?? 'http',
    run,
    toError: (cause) =>
      cause instanceof HttpFailure
        ? cause.error
        : { _tag: 'HttpNetworkError', url: '', message: messageOf(cause) },
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
  };
}

/** The default driver. Substitute it by name: `el.drivers = { http: makeHttpDriver({...}) }`. */
export const http = makeHttpDriver();

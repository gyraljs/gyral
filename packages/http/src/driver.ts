import type { Concurrency, Driver, RetryPolicy } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** An HTTP request described as data. */
export interface HttpRequest {
  readonly url: string;
  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sent as JSON. */
  readonly body?: unknown;
  /** Decodes the JSON response. Any Standard Schema library works (Zod, Valibot, Effect…). */
  readonly schema?: StandardSchemaV1;
}

/** Every way a request can fail. Delivered to `onFailure`, never thrown into the view. */
export type HttpError =
  | {
      readonly _tag: 'HttpStatusError';
      readonly url: string;
      readonly status: number;
      readonly statusText: string;
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

export function makeHttpDriver(
  options: HttpDriverOptions = {},
): Driver<HttpRequest, unknown, HttpError> {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));

  const run = async (req: HttpRequest, { signal }: { signal: AbortSignal }): Promise<unknown> => {
    const url = new URL(req.url, options.baseUrl ?? location.href).href;
    const hasBody = req.body !== undefined;
    const init: RequestInit = {
      method: req.method ?? 'GET',
      signal,
      headers: {
        accept: 'application/json',
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...req.headers,
      },
      ...(hasBody ? { body: JSON.stringify(req.body) } : {}),
    };
    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (cause) {
      throw new HttpFailure({ _tag: 'HttpNetworkError', url, message: messageOf(cause) });
    }
    if (!response.ok) {
      const { status, statusText } = response;
      throw new HttpFailure({ _tag: 'HttpStatusError', url, status, statusText });
    }
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

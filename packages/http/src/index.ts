import { command, type Command, type Concurrency } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { http, type HttpError, type HttpRequest } from './driver.js';

export { csrfFromMeta, http, makeHttpDriver, retryableHttpError } from './driver.js';
export { submitForm } from './forms.js';
export type { SubmitFormOptions } from './forms.js';
export type {
  HeaderSource,
  HttpDriverOptions,
  HttpError,
  HttpMethod,
  HttpRequest,
} from './driver.js';

export interface RequestHandlers<O, MS, MF> {
  /** Decodes the response; its output type becomes `onSuccess`'s input. */
  readonly schema?: StandardSchemaV1<unknown, O>;
  /** Decodes non-2xx bodies into `HttpStatusError.detail` (e.g. a 422 `IntentRejected`). */
  readonly errorSchema?: StandardSchemaV1;
  readonly onSuccess: (body: O) => MS | undefined;
  readonly onFailure?: (error: HttpError) => MF | undefined;
  /** Concurrency lane, e.g. `'search'`. Default `'http'`. */
  readonly key?: string;
  readonly concurrency?: Concurrency;
}

/** A command that performs `req` with the `http` driver (or its substitute). */
export function request<O = unknown, MS = never, MF = MS>(
  req: Omit<HttpRequest, 'schema' | 'errorSchema'>,
  handlers: RequestHandlers<O, MS, MF>,
): Command<MS | MF> {
  const { schema, errorSchema, onSuccess, onFailure, key, concurrency } = handlers;
  const full: HttpRequest = {
    ...req,
    ...(schema === undefined ? {} : { schema }),
    ...(errorSchema === undefined ? {} : { errorSchema }),
  };
  return command(http, full, {
    // Sound: the driver validated the body with `schema` (or O is unknown).
    onSuccess: (body) => onSuccess(body as O),
    ...(onFailure === undefined ? {} : { onFailure }),
    ...(key === undefined ? {} : { key }),
    ...(concurrency === undefined ? {} : { concurrency }),
  });
}

export function get<O = unknown, MS = never, MF = MS>(
  url: string,
  handlers: RequestHandlers<O, MS, MF>,
): Command<MS | MF> {
  return request({ url }, handlers);
}

// The JS path of a server-validated form (ADR 0008, "Round trip"): post the submission to the
// same route `formAction` serves, and turn a 422 rejection into the component's IntentRejected.
import {
  command,
  intentRejectedSchema,
  type Command,
  type Concurrency,
  type IntentRejected,
} from '@gyral/core';
import { http, type HttpError, type HttpRequest } from './driver.js';

export interface SubmitFormOptions<MS, MF> {
  readonly method?: 'POST' | 'PUT' | 'PATCH';
  /**
   * CSRF token for this submission: `{ meta: 'csrf-token' }` reads `<meta name="csrf-token">`
   * when the request runs (the same mechanism as `csrfFromMeta`); `{ token }` sends a known
   * value. The header defaults to `x-csrf-token`. Omit it when the app gave the http driver
   * default headers (`makeHttpDriver({ headers: csrfFromMeta('csrf-token') })`).
   */
  readonly csrf?:
    | { readonly meta: string; readonly header?: string }
    | { readonly token: string; readonly header?: string };
  /** The server's success answer, e.g. `{ _tag: 'Redirected', location }` (see `redirectedTo`). */
  readonly onSuccess: (body: unknown) => MS | undefined;
  /** Any failure except a 422 `IntentRejected`, which goes to the `IntentRejected` reducer. */
  readonly onFailure?: (error: HttpError) => MF | undefined;
  /** Concurrency lane. Default `form:<url>`. */
  readonly key?: string;
  /** Default `exhaust`: a second submit while one is in flight is ignored. */
  readonly concurrency?: Concurrency;
}

const isRejected = (error: HttpError): error is HttpError & { readonly detail: IntentRejected } =>
  error._tag === 'HttpStatusError' && error.status === 422 && error.detail !== undefined;

/**
 * Sends a form submission to the server (usually after `form()` validated it in the browser,
 * which passes the raw `FormData`). The body is the `FormData` itself, so the server's
 * `formAction` parses it exactly like a no-JS post. A 422 answer with an `IntentRejected`
 * (server-only checks: duplicate email, wrong password) is dispatched as `IntentRejected`.
 *
 *   Register: (s, m) => [{ ...s, busy: true }, [submitForm('/register', m.form, {
 *     csrf: { meta: 'csrf-token' },
 *     onSuccess: (body) => ({ _tag: 'Registered', location: redirectedTo(body) }),
 *     onFailure: () => ({ _tag: 'Failed' }),
 *   })]],
 */
export function submitForm<MS, MF = MS>(
  url: string,
  formData: FormData,
  options: SubmitFormOptions<MS, MF>,
): Command<MS | MF | IntentRejected> {
  const { csrf, onSuccess, onFailure } = options;
  const headers =
    csrf !== undefined && 'token' in csrf ? { [csrf.header ?? 'x-csrf-token']: csrf.token } : {};
  const req: HttpRequest = {
    url,
    method: options.method ?? 'POST',
    body: formData,
    headers,
    errorSchema: intentRejectedSchema,
    ...(csrf !== undefined && 'meta' in csrf ? { csrf } : {}),
  };
  return command<HttpRequest, unknown, HttpError, MS, MF | IntentRejected>(http, req, {
    onSuccess,
    onFailure: (error) => (isRejected(error) ? error.detail : onFailure?.(error)),
    key: options.key ?? `form:${url}`,
    concurrency: options.concurrency ?? 'exhaust',
  });
}

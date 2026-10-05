// Forms without JavaScript: the server half of ADR 0008. The same `defineForm` schema and the
// same `validateForm` as the client's `form()` intent, so both paths reject identically.
import {
  formDataToObject,
  formFields,
  validateForm,
  type FieldIssue,
  type FormDefinition,
  type IntentRejected,
} from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/** A server-side rejection of a schema-valid submission (see `rejectWith`). */
export interface FormReject {
  readonly _tag: 'FormReject';
  readonly issues: readonly FieldIssue[];
}

/**
 * Rejects a submission that passed the schema but failed a server-only check (email taken,
 * wrong password). A string is a form-level message (path `''`). `formAction` turns it into
 * the same `IntentRejected` as a schema failure, on both the no-JS and the JS path.
 */
export function rejectWith(issues: string | readonly FieldIssue[]): FormReject {
  return {
    _tag: 'FormReject',
    issues: typeof issues === 'string' ? [{ path: '', message: issues }] : issues,
  };
}

export interface FormActionHandlers<T> {
  /**
   * The form's `data-intent` name. It becomes `IntentRejected.intent`, exactly as on the
   * JS path, so the component's reducer can't tell the two apart.
   */
  readonly intent: string;
  /**
   * Valid submission: do the work, then usually `seeOther(url)` (Post/Redirect/Get), or return
   * `rejectWith(…)` when a server-only check fails.
   */
  readonly valid: (
    data: T,
    request: Request,
  ) => Response | FormReject | Promise<Response | FormReject>;
  /**
   * Invalid submission: re-render the page with the component's `.initialMessages` set to
   * `[rejected]`, typically with status 422. The component's own `IntentRejected` reducer
   * turns it into state, so the errors render through the same view as with JavaScript.
   */
  readonly invalid: (rejected: IntentRejected, request: Request) => Response | Promise<Response>;
}

/** `submitForm` (and any fetch asking for JSON) gets JSON; a browser form post gets HTML. */
const wantsJson = (request: Request): boolean => {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
};

/**
 * The JSON form of a valid answer: a redirect becomes `200 { _tag: 'Redirected', location }`
 * (fetch would otherwise follow it and get HTML). Other headers, such as `set-cookie`, are kept.
 */
function asJson(response: Response): Response {
  const location = response.headers.get('location');
  if (response.status < 300 || response.status >= 400 || location === null) return response;
  const headers = new Headers(response.headers);
  headers.delete('location');
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({ _tag: 'Redirected', location }), { status: 200, headers });
}

/**
 * A request handler for a `<form method="post">` that works with JavaScript disabled, and
 * answers the JS path (`submitForm` in @gyral/http, `Accept: application/json`) with JSON:
 * valid → the handler's response, a redirect turned into `{ _tag: 'Redirected', location }`;
 * invalid → `422` with the `IntentRejected` (without `values`, so passwords aren't echoed).
 */
export function formAction<Schema extends StandardSchemaV1>(
  definition: FormDefinition<Schema>,
  handlers: FormActionHandlers<StandardSchemaV1.InferOutput<Schema>>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let data: FormData;
    try {
      data = await request.formData();
    } catch {
      return new Response('Expected a form submission', { status: 415 });
    }
    const result = await validateForm(definition, handlers.intent, data);
    const json = wantsJson(request);
    let rejected: IntentRejected;
    if (result.ok) {
      const answer = await handlers.valid(result.data, request);
      if (answer instanceof Response) return json ? asJson(answer) : answer;
      const values = formFields(formDataToObject(data));
      rejected = { _tag: 'IntentRejected', intent: handlers.intent, issues: answer.issues, values };
    } else {
      rejected = result.rejected;
    }
    if (json) {
      const { _tag, intent, issues } = rejected;
      return Response.json({ _tag, intent, issues }, { status: 422 });
    }
    return handlers.invalid(rejected, request);
  };
}

/** 303 See Other: the redirect that turns a POST into a GET (no resubmit on reload). */
export function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

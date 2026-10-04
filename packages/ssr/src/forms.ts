// Forms without JavaScript: the server half of ADR 0008. The same `defineForm` schema and the
// same `validateForm` as the client's `form()` intent, so both paths reject identically.
import { validateForm, type FormDefinition, type IntentRejected } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface FormActionHandlers<T> {
  /**
   * The form's `data-intent` name. It becomes `IntentRejected.intent`, exactly as on the
   * JS path, so the component's reducer can't tell the two apart.
   */
  readonly intent: string;
  /** Valid submission: do the work, then usually `seeOther(url)` (Post/Redirect/Get). */
  readonly valid: (data: T, request: Request) => Response | Promise<Response>;
  /**
   * Invalid submission: re-render the page with the component's `.initialMessages` set to
   * `[rejected]`, typically with status 422. The component's own `IntentRejected` reducer
   * turns it into state, so the errors render through the same view as with JavaScript.
   */
  readonly invalid: (rejected: IntentRejected, request: Request) => Response | Promise<Response>;
}

/** A request handler for a `<form method="post">` that also works with JavaScript disabled. */
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
    return result.ok
      ? handlers.valid(result.data, request)
      : handlers.invalid(result.rejected, request);
  };
}

/** 303 See Other: the redirect that turns a POST into a GET (no resubmit on reload). */
export function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

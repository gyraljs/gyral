// `invalid(errors)` as an element hook (view/02-bindings.md "Element hooks", ADR 0008): model
// errors mirrored to native validity, so `:user-invalid` and native bubbles agree with the
// model. The server half writes `aria-invalid` into the start tag, so it is no longer written
// twice.
import { defineBasicHook } from '../view/index.js';

type Errors = readonly string[] | string | undefined;

interface Validatable extends Element {
  setCustomValidity(message: string): void;
}

const isValidatable = (el: Element): el is Validatable => 'setCustomValidity' in el;

const valueOf = (el: Element): unknown => ('value' in el ? el.value : undefined);

const formOf = (el: Element): HTMLFormElement | undefined => {
  const form = 'form' in el ? el.form : undefined;
  return form instanceof HTMLFormElement ? form : undefined;
};

const messageOf = (errors: Errors): string =>
  typeof errors === 'string' ? errors : (errors ?? []).join(' ');

/** The listeners that clear the current error, per element (hooks keep no instance state). */
const listening = new WeakMap<Element, AbortController>();

// Forms with a resubmit already queued: several stale fields in one validation pass resubmit once.
const resubmitting = new WeakSet<HTMLFormElement>();

function apply(el: Element, errors: Errors): void {
  listening.get(el)?.abort();
  listening.delete(el);
  const message = messageOf(errors);
  if (isValidatable(el)) el.setCustomValidity(message);
  if (message === '') {
    el.removeAttribute('aria-invalid');
    return;
  }
  el.setAttribute('aria-invalid', 'true');

  const controller = new AbortController();
  listening.set(el, controller);
  const { signal } = controller;
  const rejectedValue = valueOf(el);
  const clear = (): void => {
    controller.abort();
    if (isValidatable(el)) el.setCustomValidity('');
    el.removeAttribute('aria-invalid');
  };
  el.addEventListener('input', clear, { signal });
  el.addEventListener('change', clear, { signal });
  el.addEventListener(
    'invalid',
    (event) => {
      if (Object.is(valueOf(el), rejectedValue)) return; // still the rejected value
      event.preventDefault(); // no bubble for an error that no longer applies
      clear();
      const form = formOf(el);
      if (form === undefined || resubmitting.has(form)) return;
      resubmitting.add(form);
      queueMicrotask(() => {
        resubmitting.delete(form);
        form.requestSubmit();
      });
    },
    { signal },
  );
}

/**
 * Mirrors model errors to native validity: `setCustomValidity` and `aria-invalid`.
 *
 *   <input name="email" ${invalid(s.errors.email)} />
 *
 * The custom error clears when the control fires `input` or `change` (the user edited it), when
 * the bound errors become `undefined` or empty (the model cleared them), or when a submit finds
 * the error stale (the value changed without an event, e.g. set from code): then the error is
 * dropped and the form is submitted again once. An error is applied again only when a new value
 * arrives (keep `fieldErrors()` results in state): `client` runs only when the errors change.
 */
export const invalid = defineBasicHook<[errors?: Errors]>({
  server: ([errors]) => (messageOf(errors) === '' ? {} : { 'aria-invalid': 'true' }),
  client: (el, [errors]) => {
    apply(el, errors);
  },
});

import { directive } from 'lit/directive.js';
import { ElementDirective } from './element-directive.js';

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

// Forms with a resubmit already queued: several stale fields in one validation pass resubmit once.
const resubmitting = new WeakSet<HTMLFormElement>();

/**
 * Mirrors model errors to native validity (ADR 0008): sets `setCustomValidity` and
 * `aria-invalid`, so `:user-invalid` and native bubbles agree with the model.
 *
 * The custom error clears when:
 * - the control fires `input` or `change` (the user edited it);
 * - the bound errors become `undefined` or empty (the model cleared them);
 * - a submit finds the error stale: the value changed without an event (set from code, e.g.
 *   by a test or a script). Then the error is dropped and the form is submitted again once.
 *
 * An error is applied again only when a new value arrives (keep `fieldErrors()` results in
 * state). Element parts don't render on the server, so this only runs in the browser.
 */
class InvalidDirective extends ElementDirective<[errors?: Errors]> {
  #last: Errors;
  #listening: AbortController | undefined;

  apply(el: Element, [errors]: [errors?: Errors]): void {
    if (errors === this.#last) return;
    this.#last = errors;
    this.#listening?.abort();
    this.#listening = undefined;
    const message = typeof errors === 'string' ? errors : (errors ?? []).join(' ');
    if (isValidatable(el)) el.setCustomValidity(message);
    if (message === '') {
      el.removeAttribute('aria-invalid');
      return;
    }
    el.setAttribute('aria-invalid', 'true');

    const listening = new AbortController();
    this.#listening = listening;
    const { signal } = listening;
    const rejectedValue = valueOf(el);
    const clear = (): void => {
      listening.abort();
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
}

export const invalid = directive(InvalidDirective);

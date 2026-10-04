import { directive } from 'lit/directive.js';
import { ElementDirective } from './element-directive.js';

type Errors = readonly string[] | string | undefined;

interface Validatable extends Element {
  setCustomValidity(message: string): void;
}

const isValidatable = (el: Element): el is Validatable => 'setCustomValidity' in el;

/**
 * Mirrors model errors to native validity (ADR 0008): sets `setCustomValidity` and
 * `aria-invalid`, so `:user-invalid` and native bubbles agree with the model. The custom
 * error clears on the control's next `input` so the user can resubmit. An error is applied
 * again only when a new value arrives (keep `fieldErrors()` results in state).
 */
class InvalidDirective extends ElementDirective<[errors?: Errors]> {
  #last: Errors;

  apply(el: Element, [errors]: [errors?: Errors]): void {
    if (errors === this.#last) return;
    this.#last = errors;
    const message = typeof errors === 'string' ? errors : (errors ?? []).join(' ');
    if (isValidatable(el)) el.setCustomValidity(message);
    if (message === '') {
      el.removeAttribute('aria-invalid');
      return;
    }
    el.setAttribute('aria-invalid', 'true');
    el.addEventListener(
      'input',
      () => {
        if (isValidatable(el)) el.setCustomValidity('');
        el.removeAttribute('aria-invalid');
      },
      { once: true },
    );
  }
}

export const invalid = directive(InvalidDirective);

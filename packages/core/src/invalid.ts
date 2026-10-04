import { nothing } from 'lit';
import { Directive, directive, PartType, type ElementPart, type PartInfo } from 'lit/directive.js';

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
class InvalidDirective extends Directive {
  #last: Errors;

  constructor(info: PartInfo) {
    super(info);
    if (info.type !== PartType.ELEMENT) {
      throw new Error('invalid() must be used on an element: <input ${invalid(errors)}>');
    }
  }

  // Lit requires render() to declare the directive's arguments; update() does the work.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override render(errors?: Errors): typeof nothing {
    return nothing;
  }

  override update(part: ElementPart, [errors]: [Errors]): typeof nothing {
    if (errors === this.#last) return nothing;
    this.#last = errors;
    const el = part.element;
    const message = typeof errors === 'string' ? errors : (errors ?? []).join(' ');
    if (isValidatable(el)) el.setCustomValidity(message);
    if (message === '') {
      el.removeAttribute('aria-invalid');
      return nothing;
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
    return nothing;
  }
}

export const invalid = directive(InvalidDirective);

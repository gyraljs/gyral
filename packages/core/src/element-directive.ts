import { nothing } from 'lit';
import { Directive, PartType, type ElementPart, type PartInfo } from 'lit/directive.js';

/**
 * Base for element directives (`<input ${invalid(errors)}>`): they act on the element they are
 * placed on and render nothing. Subclasses declare their arguments as `Args` and implement
 * `apply`. Wrap the class with `directive()` (re-exported from core) to get the template
 * function. Element parts are not rendered on the server, so `apply` only runs in the browser.
 *
 *   class Focus extends ElementDirective<[when: boolean]> {
 *     apply(el: Element, [when]: [boolean]) { if (when && el instanceof HTMLElement) el.focus(); }
 *   }
 *   export const focusWhen = directive(Focus);
 */
export abstract class ElementDirective<Args extends unknown[]> extends Directive {
  constructor(info: PartInfo) {
    super(info);
    if (info.type !== PartType.ELEMENT) {
      throw new Error(`${new.target.name} must be used on an element: <el \${directive(…)}>`);
    }
  }

  /** Called on every render with the directive's current arguments. */
  abstract apply(element: Element, args: Args): void;

  // Lit reads the directive's arguments from render(); update() does the work.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override render(...args: Args): typeof nothing {
    return nothing;
  }

  override update(part: ElementPart, args: Args): typeof nothing {
    this.apply(part.element, args);
    return nothing;
  }
}

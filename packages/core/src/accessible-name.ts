// Accessible names across shadow boundaries (gyral-czi.26). `aria-labelledby="page-title"` inside
// a shadow root can't see an id in the page, so a form or landmark in a component would be
// nameless. `labelledBy(id)` resolves the id outward through the shadow-including ancestors.
import { directive } from 'lit/directive.js';
import { ElementDirective } from './element-directive.js';

interface Reflecting extends Element {
  ariaLabelledByElements: readonly Element[] | null;
}

/** ARIA element reflection: newly available Baseline, so feature-detected (ADR 0003). */
const reflects = (el: Element): el is Reflecting => 'ariaLabelledByElements' in el;

/** The element with `id`, searched from `from`'s own root outward to the document. */
export function findInScope(from: Element, id: string): Element | null {
  for (let root: Node = from.getRootNode(); ;) {
    const found = 'getElementById' in root ? (root as DocumentOrShadow).getElementById(id) : null;
    if (found !== null && found !== from) return found;
    if (!(root instanceof ShadowRoot)) return null;
    root = root.host.getRootNode();
  }
}

type DocumentOrShadow = Document | ShadowRoot;

/**
 * Names the element after the element with `id`, even outside this component's shadow root:
 *
 *   <form aria-label=${props.label} ${labelledBy('page-title')}>
 *
 * Uses `ariaLabelledByElements` (ARIA element reflection) where the browser has it, so the name
 * stays in sync with the heading. Elsewhere it sets `aria-label` from `fallback`, or from the
 * target's text. Element directives don't run on the server, so render a plain `aria-label` too
 * (from a `label` prop) for the no-JS page: `aria-labelledby` wins over it once set.
 */
class LabelledBy extends ElementDirective<[id: string, fallback?: string]> {
  #applied = '';

  apply(el: Element, [id, fallback]: [id: string, fallback?: string]): void {
    const key = `${id}\u0000${fallback ?? ''}`;
    if (key === this.#applied) return;
    this.#applied = key;
    // The labelling element may render after this one (a later sibling); try again once.
    if (!this.#name(el, id, fallback)) {
      queueMicrotask(() => {
        this.#name(el, id, fallback);
      });
    }
  }

  #name(el: Element, id: string, fallback: string | undefined): boolean {
    const target = findInScope(el, id);
    if (target !== null && reflects(el)) {
      el.ariaLabelledByElements = [target];
      return true;
    }
    const text = fallback ?? target?.textContent.trim() ?? '';
    if (text !== '') el.setAttribute('aria-label', text);
    return target !== null;
  }
}

export const labelledBy = directive(LabelledBy);

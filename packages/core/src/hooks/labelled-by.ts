// `labelledBy(id, fallback?)` as an element hook (view/02-bindings.md "Element hooks",
// gyral-czi.26): accessible names across shadow boundaries. `aria-labelledby="page-title"`
// inside a shadow root can't see an id in the page, so the id is resolved outward through the
// shadow-including ancestors.
import { defineBasicHook } from '../view/index.js';

interface Reflecting extends Element {
  ariaLabelledByElements: readonly Element[] | null;
}

/** ARIA element reflection: newly available Baseline, so feature-detected (ADR 0003). */
const reflects = (el: Element): el is Reflecting => 'ariaLabelledByElements' in el;

type DocumentOrShadow = Document | ShadowRoot;

/** The element with `id`, searched from `from`'s own root outward to the document. */
export function findInScope(from: Element, id: string): Element | null {
  for (let root: Node = from.getRootNode(); ;) {
    const found = 'getElementById' in root ? (root as DocumentOrShadow).getElementById(id) : null;
    if (found !== null && found !== from) return found;
    if (!(root instanceof ShadowRoot)) return null;
    root = root.host.getRootNode();
  }
}

/** Names `el`; false when the target wasn't found (it may render later). */
function name(el: Element, id: string, fallback: string | undefined): boolean {
  const target = findInScope(el, id);
  if (target !== null && reflects(el)) {
    el.ariaLabelledByElements = [target];
    return true;
  }
  const text = fallback ?? target?.textContent.trim() ?? '';
  if (text !== '') el.setAttribute('aria-label', text);
  return target !== null;
}

/**
 * Names the element after the element with `id`, even outside this component's shadow root:
 *
 *   <form ${labelledBy('page-title', 'Sign in')}>
 *
 * Uses `ariaLabelledByElements` (ARIA element reflection) where the browser has it, so the name
 * stays in sync with the heading. Elsewhere it sets `aria-label` from `fallback`, or from the
 * target's text. It has no server half: render a plain `aria-label` too (from a `label`
 * prop) for the page before scripts run; the reflected `aria-labelledby` wins over it.
 */
export const labelledBy = defineBasicHook<[id: string, fallback?: string]>({
  client: (el, [id, fallback]) => {
    // The labelling element may render after this one (a later sibling): try again once.
    if (!name(el, id, fallback)) {
      queueMicrotask(() => {
        name(el, id, fallback);
      });
    }
  },
});

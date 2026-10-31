// The lazily loaded half of hydration (view/07-hydration.md "Loading"): the parallel walk and
// islands. element.ts imports this module with import() when the first host that needs it
// connects (one with a seed or `defer-hydration`), so client-only pages never fetch it.
import { DEVTOOLS_ENABLED, devMismatch } from '#devtools';
import {
  DEV,
  hydrate,
  HydrationMismatch,
  message,
  render,
  type ChildValue,
  type SeenMarkup,
} from './view/index.js';

export { scheduleIsland } from './islands.js';

/**
 * Hydrates a server-rendered host's root with its first view (view/07-hydration.md "Steps").
 * A shadow root swaps styles in the same step (08 "Hydration"): the shared sheets are adopted
 * and the server's `<style>` removed. On a mismatch both builds recover this component only:
 * the root is cleared and rendered fresh. Development logs the mismatch in full as an error,
 * production warns (G0063); it isn't a failure for the error channel (ADR 0018 addendum
 * "Hydration mismatches recover in development").
 */
export function hydrateRoot(
  host: HTMLElement,
  tag: string,
  view: ChildValue,
  root: ShadowRoot | HTMLElement,
  sheets: CSSStyleSheet[] | undefined,
  seen: SeenMarkup,
): void {
  if (sheets !== undefined) {
    (root as ShadowRoot).adoptedStyleSheets = sheets;
    const first = root.firstChild;
    if (sheets.length > 0 && first?.nodeName === 'STYLE') first.remove();
  }
  try {
    hydrate(view, root, `<${tag}>`, seen);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
    if (DEVTOOLS_ENABLED) devMismatch(host, tag, error.message);
    if (DEV) console.error(error.message, message(63, tag));
    else console.warn(message(63, tag), error.message);
    root.replaceChildren();
    render(view, root, seen);
  }
}

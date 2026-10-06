// The lazily loaded half of hydration (view/07-hydration.md "Loading"): the parallel walk and
// islands. element.ts imports this module with import() when the first host that needs it
// connects (one with a seed or `defer-hydration`), so client-only pages never fetch it.
import { DEVTOOLS_ENABLED, devMismatch } from '#devtools';
import { DEV, hydrate, HydrationMismatch, render, type ChildValue } from './view/index.js';

export { scheduleIsland } from './islands.js';

/**
 * Hydrates a server-rendered host's root with its first view (view/07-hydration.md "Steps").
 * A shadow root swaps styles in the same step (08 "Hydration"): the shared sheets are adopted
 * and the server's `<style>` removed. On a mismatch development throws; production recovers
 * this component only: it clears the root, renders fresh and warns.
 */
export function hydrateRoot(
  host: HTMLElement,
  tag: string,
  view: ChildValue,
  root: ShadowRoot | HTMLElement,
  sheets: CSSStyleSheet[] | undefined,
): void {
  if (sheets !== undefined) {
    (root as ShadowRoot).adoptedStyleSheets = sheets;
    const first = root.firstChild;
    if (sheets.length > 0 && first?.nodeName === 'STYLE') first.remove();
  }
  try {
    hydrate(view, root, `<${tag}>`);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
    if (DEVTOOLS_ENABLED) devMismatch(host, tag, error.message);
    if (DEV) throw error;
    console.warn(`${error.message} <${tag}> was rendered fresh.`);
    root.replaceChildren();
    render(view, root);
  }
}

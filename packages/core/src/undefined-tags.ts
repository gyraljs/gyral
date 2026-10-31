// Development only: warns about custom-element tags on the page that nothing defines. An entry
// that never imports a component's module leaves its tag an unknown element that renders
// nothing and reports no error. define() starts the check under `if (DEV)`, so core's
// production build (dist/prod/) has no import of this module, and Rollup-based builds of the
// full build drop it with the branch. It looks a few seconds after the page loads, and
// again after each later define() (a lazily loaded route can render more tags), in the document
// and in open shadow roots; it warns once per tag.
import { message } from './view/index.js';

/** How long after load (or a later define()) a tag may stay undefined. */
export const UNDEFINED_GRACE_MS = 3000;

const warned = new Set<string>();
/** idle → (waiting for load →) scheduled → idle after the check. */
let state: 'idle' | 'loading' | 'scheduled' = 'idle';

/** Elements whose tag no custom element defines, in `root` and the open shadow roots below it. */
function undefinedTags(root: Document | ShadowRoot, found: Set<string>): Set<string> {
  for (const el of root.querySelectorAll(':not(:defined)')) found.add(el.localName);
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot !== null) undefinedTags(el.shadowRoot, found);
  }
  return found;
}

/** Warns about each tag still undefined, once. */
export function checkUndefinedTags(): void {
  state = 'idle';
  for (const tag of undefinedTags(document, new Set())) {
    if (warned.has(tag) || customElements.get(tag) !== undefined) continue;
    warned.add(tag);
    console.warn(message(14, tag, String(UNDEFINED_GRACE_MS / 1000)));
  }
}

/** Schedules a check once the page has loaded (define() calls this in development). */
export function watchUndefinedTags(): void {
  if (typeof document === 'undefined' || state !== 'idle') return;
  const schedule = (): void => {
    state = 'scheduled';
    setTimeout(checkUndefinedTags, UNDEFINED_GRACE_MS);
  };
  if (document.readyState === 'complete') {
    schedule();
  } else {
    state = 'loading';
    window.addEventListener('load', schedule, { once: true });
  }
}

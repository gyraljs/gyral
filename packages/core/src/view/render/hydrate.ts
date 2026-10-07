// `hydrate(value, root)` (view/07-hydration.md): the first client render of server-rendered DOM.
// Kept apart from render.ts so the walk (adopt.ts) is bundled only where hydration is used: core
// loads it lazily, with the first server-rendered host (07 "Loading").
import { adopt } from './adopt.js';
import { ChildPart } from './child-part.js';
import { dropHooks, hookMark, runHooks } from './hooks.js';
import { setRootPart } from './render.js';
import { listenFor, type SeenMarkup } from './seen.js';
import type { ChildValue } from './values.js';

/**
 * Hydrates the server-rendered DOM in `root` with `value`, the first client render
 * (view/07-hydration.md): builds the parts over the existing nodes, runs element hooks' client
 * halves once, and leaves later `render` calls to update in place. Throws `HydrationMismatch`
 * when the DOM doesn't match; `host` names the component in its message; `seen` is as for
 * `render`.
 */
export function hydrate(
  value: ChildValue,
  root: Element | ShadowRoot,
  host = 'the root',
  seen?: SeenMarkup,
): void {
  const part = new ChildPart(root, null, null, 0, false, 0);
  const mark = hookMark();
  const outer = listenFor(seen);
  try {
    adopt(part, value, root, host);
  } catch (error) {
    dropHooks(mark);
    throw error;
  } finally {
    listenFor(outer);
  }
  setRootPart(root, part);
  runHooks(mark, root);
}

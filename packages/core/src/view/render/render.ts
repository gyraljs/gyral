// `render(value, root)`: the client renderer's entry point (view/02-bindings.md "Commit order").
// The root's child part is cached per root, so later calls update in place. Synchronous: when
// it returns, the DOM is committed and every element hook's `client` call has run. The
// scheduler (view/04-scheduler.md) calls it once per dirty host, inside `renderBatch`, so the
// list dev check's budget (03) is per flush; a call outside a batch gets a budget of its own.
// `hydrate(value, root)` (hydrate.ts) makes the same root part from server DOM instead (07).
import { DEV } from '#view-dev';
import { ChildPart } from './child-part.js';
import { resetRowChecks } from './dev-check.js';
import { dropHooks, hookMark, runHooks } from './hooks.js';
import { listenFor, type SeenMarkup } from './seen.js';
import type { ChildValue } from './values.js';

const roots = new WeakMap<Node, ChildPart>();
let batching = false;

/** Runs `fn` (one scheduler flush) with one shared row-check budget for every render in it. */
export function renderBatch(fn: () => void): void {
  if (!DEV) {
    fn(); // the budget is a development check: production needs no batch state
    return;
  }
  resetRowChecks();
  const outer = batching;
  batching = true;
  try {
    fn();
  } finally {
    batching = outer;
  }
}

/**
 * Renders `value` into `root`, updating what an earlier call rendered there. `seen` is told
 * about each template the render instantiates (seen.ts).
 */
export function render(
  value: ChildValue,
  root: Element | ShadowRoot | DocumentFragment,
  seen?: SeenMarkup,
): void {
  let part = roots.get(root);
  if (part === undefined) {
    part = new ChildPart(root, null, null, 0, false, 0);
    roots.set(root, part);
  }
  const mark = hookMark();
  if (DEV && !batching) resetRowChecks();
  const outer = listenFor(seen);
  try {
    part.commit(value);
  } catch (error) {
    dropHooks(mark);
    throw error;
  } finally {
    listenFor(outer);
  }
  runHooks(mark);
}

/** Hydration (hydrate.ts): `part`, built over server DOM, is `root`'s part from now on. */
export function setRootPart(root: Node, part: ChildPart): void {
  roots.set(root, part);
}

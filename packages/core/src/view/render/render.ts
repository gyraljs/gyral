// `render(value, root)`: the client renderer's entry point (view/02-bindings.md "Commit order").
// The root's child part is cached per root, so later calls update in place. Synchronous: when
// it returns, the DOM is committed and every element hook's `client` call has run. The
// scheduler (view/04-scheduler.md) calls it once per dirty host, inside `renderBatch`, so the
// list dev check's budget (03) is per flush; a call outside a batch gets a budget of its own.
// `hydrate(value, root)` makes the same root part from server DOM instead (view/07).
import { DEV } from '#view-dev';
import { adopt } from './adopt.js';
import { ChildPart } from './child-part.js';
import { resetRowChecks } from './dev-check.js';
import { dropHooks, hookMark, runHooks } from './hooks.js';
import type { ChildValue } from './values.js';

const roots = new WeakMap<Node, ChildPart>();
let batching = false;

/** Runs `fn` (one scheduler flush) with one shared row-check budget for every render in it. */
export function renderBatch(fn: () => void): void {
  if (DEV) resetRowChecks();
  const outer = batching;
  batching = true;
  try {
    fn();
  } finally {
    batching = outer;
  }
}

/** Renders `value` into `root`, updating what an earlier call rendered there. */
export function render(value: ChildValue, root: Element | ShadowRoot | DocumentFragment): void {
  let part = roots.get(root);
  if (part === undefined) {
    part = new ChildPart(root, null, null, 0, false, 0);
    roots.set(root, part);
  }
  const mark = hookMark();
  if (DEV && !batching) resetRowChecks();
  try {
    part.commit(value);
  } catch (error) {
    dropHooks(mark);
    throw error;
  }
  runHooks(mark);
}

/**
 * Hydrates the server-rendered DOM in `root` with `value`, the first client render
 * (view/07-hydration.md): builds the parts over the existing nodes, runs element hooks' client
 * halves once, and leaves later `render` calls to update in place. Throws `HydrationMismatch`
 * when the DOM doesn't match; `host` names the component in its message.
 */
export function hydrate(value: ChildValue, root: Element | ShadowRoot, host = 'the root'): void {
  const part = new ChildPart(root, null, null, 0, false, 0);
  const mark = hookMark();
  try {
    adopt(part, value, root, host);
  } catch (error) {
    dropHooks(mark);
    throw error;
  }
  roots.set(root, part);
  runHooks(mark);
}

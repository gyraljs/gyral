// `render(value, root)`: the client renderer's entry point (view/02-bindings.md "Commit order").
// The root's child part is cached per root, so later calls update in place. Synchronous: when
// it returns, the DOM is committed and every element hook's `client` call has run. The
// scheduler (view/04-scheduler.md, Phase 3) calls it once per dirty host.
import { DEV } from '#view-dev';
import { ChildPart } from './child-part.js';
import { resetRowChecks } from './dev-check.js';
import { dropHooks, hookMark, runHooks } from './hooks.js';
import type { ChildValue } from './values.js';

const roots = new WeakMap<Node, ChildPart>();

/** Renders `value` into `root`, updating what an earlier call rendered there. */
export function render(value: ChildValue, root: Element | ShadowRoot | DocumentFragment): void {
  let part = roots.get(root);
  if (part === undefined) {
    part = new ChildPart(root, null, null, 0, false, 0);
    roots.set(root, part);
  }
  const mark = hookMark();
  if (DEV) resetRowChecks();
  try {
    part.commit(value);
  } catch (error) {
    dropHooks(mark);
    throw error;
  }
  runHooks(mark);
}

// `render(value, root)`: the client renderer's entry point (view/02-bindings.md "Commit order").
// The root's child part is cached per root, so later calls update in place. Synchronous: when
// it returns, the DOM is committed, and outside a flush every element hook's `client` call has
// run. The scheduler (view/04-scheduler.md) calls it once per dirty host, inside `renderBatch`,
// so the list dev check's budget (03) is per flush and hooks run once every host has rendered,
// children first (hooks.ts); a call outside a batch gets a budget and a hook run of its own.
// `hydrate(value, root)` (hydrate.ts) makes the same root part from server DOM instead (07).
import { DEV } from '#view-dev';
import { ChildPart } from './child-part.js';
import { checkSkippedView, resetRowChecks, sameChild } from './dev-check.js';
import { message } from '../message.js';
import { dropHooks, endHooks, hookMark, runHooks, startHooks } from './hooks.js';
import { listenFor, type SeenMarkup } from './seen.js';
import type { ChildValue } from './values.js';

const roots = new WeakMap<Node, ChildPart>();
let batching = false;

/**
 * Runs `fn` (one scheduler flush) with one shared row-check budget for every render in it, and
 * element hooks deferred to `flushHooks` (after each pass) and the end of the flush.
 */
export function renderBatch(fn: () => void): void {
  if (DEV) resetRowChecks(); // the budget is a development check
  const outer = batching;
  startHooks(); // element hooks wait for the flush (hook-run.ts)
  let ok = false;
  batching = true;
  try {
    fn();
    ok = true;
  } finally {
    batching = outer;
    endHooks(ok);
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
  const mark = hookMark(root);
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
  runHooks(mark, root);
}

/** Components already warned about (G0017), once each. */
const impure = new Set<string>();

/**
 * Development (gyral-337.1): `view` is the view of host `tag`, whose render was skipped because
 * its state, props and stores are unchanged. If it renders anything else than what `root`
 * shows, the view reads something besides them: warn once for the component (G0017).
 */
export function recheckView(root: Node, tag: string, view: () => ChildValue): void {
  // Also guarded here: a build that splits this module from its caller keeps the export, and
  // only this guard keeps the check's code out of production.
  if (!DEV) return;
  const part = roots.get(root);
  if (part === undefined || impure.has(tag) || !checkSkippedView()) return;
  let same: boolean;
  try {
    same = sameChild(part, view());
  } catch {
    same = false;
  }
  if (same) return;
  impure.add(tag);
  console.warn(message(17, tag));
}

/** Hydration (hydrate.ts): `part`, built over server DOM, is `root`'s part from now on. */
export function setRootPart(root: Node, part: ChildPart): void {
  roots.set(root, part);
}

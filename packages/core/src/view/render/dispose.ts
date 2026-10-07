// Disposable hooks (view/02-bindings.md "Widgets with a lifecycle"): `defineDisposableHook`
// and the tracking behind it. A disposable hook is tracked per render root from its commit
// (`track`), with the spec and arguments to dispose (`kept`, `keptArgs`). After each render of
// a root commits, before its client calls, `run` disposes every tracked hook whose element left
// the root (Gyral removed it: a cleared part, a replaced instance, a removed row; moves keep it
// inside) or whose position no longer holds it (`nothing`, another hook); a disposable hook
// replacing one disposes the old one in `track`. When the host disconnects, `run(root, true)`
// disposes the root's hooks and marks them `off`: the render on reconnect re-commits them from
// scratch (`prev` undefined) or, for skipped rows, `run` queues their `client` again. Nothing
// here is bundled unless an app calls `defineDisposableHook` (gyral-c5d.2: `defineHook` has no
// `dispose`), and nothing runs until such a hook commits.
import { commitHook } from './hook-part.js';
import {
  hookResult,
  queueHook,
  useDisposal,
  type DisposableHookSpec,
  type HookPart,
  type HookResult,
} from './hooks.js';

let fresh: HookPart[] = [];
const live = new WeakMap<Node, Set<HookPart>>();

const dispose = (p: HookPart): void => {
  (p.kept as DisposableHookSpec<readonly unknown[]>).dispose(
    p.el,
    p.keptArgs as readonly unknown[],
  );
};

function run(root: Node, disconnect?: boolean): boolean {
  let tracked = live.get(root);
  if (disconnect !== true) {
    for (const p of fresh) {
      if (!root.contains(p.el)) continue; // left over from a render that threw
      if (tracked === undefined) live.set(root, (tracked = new Set()));
      tracked.add(p);
    }
    fresh = [];
  }
  if (tracked === undefined) return false;
  for (const p of tracked) {
    const off = p.off;
    p.off = disconnect;
    if (disconnect === true || !root.contains(p.el) || p.spec !== p.kept) {
      if (disconnect !== true) tracked.delete(p);
      if (off !== true) dispose(p);
    } else if (off === true) {
      p.prev = undefined; // a skipped row's hook: client again, from scratch
      queueHook(p);
    }
  }
  return tracked.size > 0;
}

/** A disposable hook committed at `part`: tracks it, and turns disposal on. */
function track(part: HookPart): void {
  useDisposal(run);
  // Replaced by this one, unless a disconnect disposed it already.
  if (part.off !== true && part.kept !== undefined && part.kept !== part.spec) dispose(part);
  part.off = false;
  part.kept = (part.spec ?? undefined) as DisposableHookSpec<readonly unknown[]> | undefined;
  part.keptArgs = part.args;
  fresh.push(part);
}

/** Commits a disposable hook, then tracks it for removal and disconnects. */
function commitTracked(part: HookPart, result: HookResult): void {
  if (part.off === true) part.spec = null; // disposed by a disconnect: start over, always queued
  commitHook(part, result);
  track(part);
}

/**
 * Defines an element hook with a teardown: `dispose(el, args)` runs when Gyral removes the
 * element, when the position stops holding the hook, or when the host disconnects; never on
 * moves. A separate function from `defineHook`, so only apps that call it bundle the tracking.
 */
export function defineDisposableHook<A extends readonly unknown[]>(
  spec: DisposableHookSpec<A>,
): (...args: A) => HookResult<A> {
  return (...args) => hookResult(spec, args, commitTracked);
}

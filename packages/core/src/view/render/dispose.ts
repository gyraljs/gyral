// Hook disposal (view/02-bindings.md "Widgets with a lifecycle"). A hook with `dispose` is
// tracked per render root from its commit (`track`), with the spec and arguments to dispose
// (`kept`, `keptArgs`). After each render of a root commits, before its client calls, `run`
// disposes every tracked hook whose element left the root (Gyral removed it: a cleared part,
// a replaced instance, a removed row; moves keep it inside) or whose position no longer holds
// it (`nothing`, another hook); a disposable hook replacing one disposes the old one in
// `track`. When the host disconnects, `run(root, true)` disposes the root's hooks and marks
// them `off`: the render on reconnect re-commits them from scratch (`prev` undefined) or, for
// skipped rows, `run` queues their `client` again. Nothing here is bundled unless an app calls
// `defineHook`, and nothing runs until a hook with `dispose` commits.
import { queueHook, useDisposal, type HookPart } from './hooks.js';

let fresh: HookPart[] = [];
const live = new WeakMap<Node, Set<HookPart>>();

const dispose = (p: HookPart): void => {
  (p.kept?.dispose as (el: Element, args: unknown) => void)(p.el, p.keptArgs);
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

/** A hook with `dispose` committed at `part`: tracks it, and turns disposal on. */
export function track(part: HookPart): void {
  useDisposal(run);
  // Replaced by this one, unless a disconnect disposed it already.
  if (part.off !== true && part.kept !== undefined && part.kept !== part.spec) dispose(part);
  part.off = false;
  part.kept = part.spec ?? undefined;
  part.keptArgs = part.args;
  fresh.push(part);
}

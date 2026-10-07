// `defineHook` (view/02-bindings.md "Element hooks"): its results carry `commitHook`, so the
// code that compares arguments and queues client calls is bundled only by apps with hooks.
// `defineHook`'s results also track hooks with `dispose` (dispose.ts); core's own hooks
// (`invalid`, `labelledBy`) have no `dispose` and use `defineBasicHook`, so apps that only use
// them don't bundle the tracking.
import { track } from './dispose.js';
import {
  hookResult,
  hookSpec,
  queueHook,
  sameArgs,
  type HookPart,
  type HookResult,
  type HookSpec,
} from './hooks.js';

/** Queues the client call when the hook or its arguments changed. */
function commitHook(part: HookPart, result: HookResult): void {
  const spec = hookSpec(result) as HookSpec<readonly unknown[]>;
  const args = result.args;
  const same = spec === part.spec;
  if (same && sameArgs(args, part.args)) return;
  part.prev = same ? part.args : undefined;
  part.spec = spec;
  part.args = args;
  queueHook(part);
}

/** A hook with `dispose`: committed, then tracked for removal and disconnects (dispose.ts). */
function commitTracked(part: HookPart, result: HookResult): void {
  if (part.off === true) part.spec = null; // disposed by a disconnect: start over, always queued
  commitHook(part, result);
  track(part);
}

/** Defines an element hook: a small behaviour attached to the element it sits on. */
export function defineHook<A extends readonly unknown[]>(
  spec: HookSpec<A>,
): (...args: A) => HookResult<A> {
  const commit = spec.dispose === undefined ? commitHook : commitTracked;
  return (...args) => hookResult(spec, args, commit);
}

/** Internal: `defineHook` for hooks without `dispose` (core's own), without the tracking. */
export function defineBasicHook<A extends readonly unknown[]>(
  spec: HookSpec<A> & { readonly dispose?: never },
): (...args: A) => HookResult<A> {
  return (...args) => hookResult(spec, args, commitHook);
}

// `defineHook` (view/02-bindings.md "Element hooks"): its results carry `commitHook`, so the
// code that compares arguments and queues client calls is bundled only by apps with hooks.
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

/** Defines an element hook: a small behaviour attached to the element it sits on. */
export function defineHook<A extends readonly unknown[]>(
  spec: HookSpec<A>,
): (...args: A) => HookResult<A> {
  return (...args) => hookResult(spec, args, commitHook);
}

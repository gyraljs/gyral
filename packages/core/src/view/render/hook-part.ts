// `defineHook` (view/02-bindings.md "Element hooks"): its results carry `commitHook`, so the
// code that compares arguments and queues client calls is bundled only by apps with hooks.
// Hooks with a teardown come from `defineDisposableHook` (dispose.ts), whose tracking only the
// apps calling it bundle (gyral-c5d.2).
import { DEV } from '#view-dev';
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
export function commitHook(part: HookPart, result: HookResult): void {
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
  spec: HookSpec<A> & { readonly dispose?: never },
): (...args: A) => HookResult<A> {
  // Untyped callers (JavaScript, a cast) may still pass one: say where it goes.
  if (DEV && (spec as { readonly dispose?: unknown }).dispose !== undefined) {
    throw new TypeError(
      'gyral: defineHook() takes no dispose. A hook with a teardown is defined with ' +
        'defineDisposableHook() (view/02-bindings.md "Widgets with a lifecycle").',
    );
  }
  return (...args) => hookResult(spec, args, commitHook);
}

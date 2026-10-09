// `defineHook` (view/02-bindings.md "Element hooks"): its results carry `commitHook`, so the
// code that compares arguments and queues client calls is bundled only by apps with hooks.
// A spec with `dispose` commits through dispose.ts's tracking, registered separately (hooks.ts
// `disposableCommit`) so apps whose hooks have no teardown don't bundle it (gyral-c5d.2).
import { DEV } from '#view-dev';
import { runner } from './hook-run.js';
import {
  disposableCommit,
  hookResult,
  hookSpec,
  queueHook,
  sameArgs,
  useHookRunner,
  type HookPart,
  type HookResult,
  type HookSpec,
} from './hooks.js';

/** Queues the client call when the hook or its arguments changed, or always (`update`). */
export function commitHook(part: HookPart, result: HookResult): void {
  const spec = hookSpec(result) as HookSpec<readonly unknown[]>;
  const args = result.args;
  const same = spec === part.spec;
  if (same && spec.update !== 'always' && sameArgs(args, part.args)) return;
  part.prev = same ? part.args : undefined;
  part.spec = spec;
  part.args = args;
  queueHook(part);
}

/** Defines an element hook: a small behaviour attached to the element it sits on. */
export function defineHook<A extends readonly unknown[]>(
  spec: HookSpec<A>,
): (...args: A) => HookResult<A> {
  useHookRunner(runner);
  return (...args) =>
    hookResult(spec, args, spec.dispose === undefined ? commitHook : commitDisposable);
}

let warned = false;

/** A hook with `dispose`: tracked when disposal is registered, else committed plainly. */
function commitDisposable(part: HookPart, result: HookResult): void {
  if (DEV && disposableCommit === undefined && !warned) {
    warned = true;
    console.warn(
      'gyral: a hook declares dispose, but the build found no module naming it, so hook ' +
        'disposal was left out and dispose never runs. Write the dispose key in your source ' +
        '(view/05-element.md "Features register themselves").',
    );
  }
  (disposableCommit ?? commitHook)(part, result);
}

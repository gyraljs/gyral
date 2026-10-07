// Element hooks (view/02-bindings.md "Element hooks", "Commit order"): their types and the
// queue of client calls. A hook position (attr-parts.ts, kind HOOK) queues itself when its
// arguments change (shallow `Object.is` per argument, hook-part.ts, which also holds
// `defineHook`); `render` runs the queued `client` calls after the commit, in document order.
// A hook from `defineDisposableHook` also has `dispose`, which runs when the element leaves its
// render root (Gyral removed it: its part cleared, its instance replaced, its row removed), when
// the position stops holding the hook, or when the host disconnects; not on moves. That
// machinery (dispose.ts) registers itself in `disposal` when the first such hook commits, and
// only apps that call `defineDisposableHook` bundle it (gyral-c5d.2): other apps pay one empty
// check per render and per disconnect.

const HOOK: unique symbol = Symbol('gyral.hook');
/** Internal: a hook result's commit function (hook-part.ts), so apps without hooks skip it. */
export const COMMIT_HOOK: unique symbol = Symbol('gyral.hook.commit');

/** Attributes a hook's server half adds to the start tag (`true`: present, no value). */
export type HookAttributes = Readonly<Record<string, string | true>>;

export interface HookSpec<A extends readonly unknown[]> {
  /** Attributes for the server-rendered start tag (view/06-server.md). */
  server?(args: A): HookAttributes;
  /** Runs after the commit when `args` changed; `prev` is undefined the first time. */
  client(el: Element, args: A, prev: A | undefined): void;
}

/** A hook with a teardown (`defineDisposableHook`, view/02 "Widgets with a lifecycle"). */
export interface DisposableHookSpec<A extends readonly unknown[]> extends HookSpec<A> {
  /**
   * Teardown, with the last arguments `client` got: runs when Gyral removes the element, when
   * the position stops holding this hook, or when the host disconnects (not on `moveBefore`
   * moves). After a host reconnects, `client` runs again with `prev` undefined.
   */
  dispose(el: Element, args: A): void;
}

/** What a hook returns in a template: `<input ${invalid(errors)}>`. */
export interface HookResult<A extends readonly unknown[] = readonly unknown[]> {
  readonly [HOOK]: HookSpec<A>;
  readonly [COMMIT_HOOK]: (part: HookPart, result: HookResult) => void;
  readonly args: A;
}

/** A hook position as committing sees it (an element part of kind HOOK). */
export interface HookPart {
  readonly el: Element;
  spec: HookSpec<readonly unknown[]> | null;
  args: readonly unknown[] | undefined;
  prev: readonly unknown[] | undefined;
  /** dispose.ts: the tracked disposable hook, its last arguments, and whether a disconnect
   * disposed it (`client` runs again after the next render). */
  kept?: DisposableHookSpec<readonly unknown[]> | undefined;
  keptArgs?: readonly unknown[] | undefined;
  off?: boolean | undefined;
}

export const isHook = (value: unknown): value is HookResult =>
  typeof value === 'object' && value !== null && HOOK in value;

/** The spec of a hook result, or undefined for anything else. */
export const hookSpec = (value: unknown): HookSpec<readonly unknown[]> | undefined =>
  isHook(value) ? value[HOOK] : undefined;

/** Internal (hook-part.ts): a hook result. */
export const hookResult = <A extends readonly unknown[]>(
  spec: HookSpec<A>,
  args: A,
  commit: HookResult[typeof COMMIT_HOOK],
): HookResult<A> => ({ [HOOK]: spec, [COMMIT_HOOK]: commit, args });

/** Shallow comparison of two argument lists, `Object.is` per argument. */
export function sameArgs(a: readonly unknown[], b: readonly unknown[] | undefined): boolean {
  if (b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * Hook disposal (dispose.ts), set when the first disposable hook commits: `disposal(root)`
 * after a render of `root` commits (before its client calls), `disposal(root, true)` when the
 * host owning `root` disconnects (true when hooks wait to run `client` again after the next
 * render). A plain variable, not an object, to keep apps without it small.
 */
let disposal: ((root: Node, disconnect?: boolean) => boolean) | undefined;

/** Internal (dispose.ts): turns hook disposal on. */
export function useDisposal(run: (root: Node, disconnect?: boolean) => boolean): void {
  disposal = run;
}

/** The host owning `root` disconnected (element.ts): disposes its disposable hooks. */
export const suspendHooks = (root: Node | undefined): boolean | undefined =>
  disposal?.(root as Node, true);

const queue: HookPart[] = [];

/** Queues `part`'s client call for the end of the render (document order). */
export function queueHook(part: HookPart): void {
  queue.push(part);
}

/** The queue position before a render, for `runHooks`/`dropHooks`. */
export const hookMark = (): number => queue.length;

/** Runs the `client` calls queued since `mark`, in document order, after `root` committed. */
export function runHooks(mark: number, root: Node): void {
  disposal?.(root); // disposable hooks whose element left `root` dispose first (dispose.ts)
  try {
    for (let i = mark; i < queue.length; i++) {
      const part = queue[i] as HookPart;
      (part.spec as HookSpec<readonly unknown[]>).client(
        part.el,
        part.args as readonly unknown[],
        part.prev,
      );
    }
  } finally {
    queue.length = mark;
  }
}

/** Forgets the calls queued since `mark` (the render threw). */
export function dropHooks(mark: number): void {
  queue.length = mark;
}

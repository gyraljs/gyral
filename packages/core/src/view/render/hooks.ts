// Element hooks (view/02-bindings.md "Element hooks", "Commit order"): their types and the
// queue of client calls. A hook position (attr-parts.ts, kind HOOK) queues itself when its
// arguments change (shallow `Object.is` per argument, hook-part.ts, which also holds
// `defineHook`); `render` runs the queued `client` calls after the commit, in document order.
// There is no cleanup: listeners a hook adds to its element are collected with it.

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

const queue: HookPart[] = [];

/** Queues `part`'s client call for the end of the render (document order). */
export function queueHook(part: HookPart): void {
  queue.push(part);
}

/** The queue position before a render, for `runHooks`/`dropHooks`. */
export const hookMark = (): number => queue.length;

/** Runs the `client` calls queued since `mark`, in document order. */
export function runHooks(mark: number): void {
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

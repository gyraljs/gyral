// Element hooks (view/02-bindings.md "Element hooks", "Commit order"): `defineHook` and the
// queue of client calls. A hook position (attr-parts.ts, kind HOOK) queues itself when its
// arguments change (shallow `Object.is` per argument); `render` runs the queued `client` calls
// after the commit, in document order.
// There is no cleanup: listeners a hook adds to its element are collected with it.

const HOOK: unique symbol = Symbol('gyral.hook');

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
  readonly args: A;
}

/** Defines an element hook: a small behaviour attached to the element it sits on. */
export function defineHook<A extends readonly unknown[]>(
  spec: HookSpec<A>,
): (...args: A) => HookResult<A> {
  return (...args) => ({ [HOOK]: spec, args });
}

/** The spec of a hook result, or undefined for anything else. */
export const hookSpec = (value: unknown): HookSpec<readonly unknown[]> | undefined =>
  typeof value === 'object' && value !== null && HOOK in value
    ? (value as HookResult)[HOOK]
    : undefined;

/** Shallow comparison of two argument lists, `Object.is` per argument. */
export function sameArgs(a: readonly unknown[], b: readonly unknown[] | undefined): boolean {
  if (b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** A hook position whose client call is due (an element part of kind HOOK). */
interface Due {
  readonly el: Element;
  readonly spec: HookSpec<readonly unknown[]> | null;
  readonly args: readonly unknown[] | undefined;
  readonly prev: readonly unknown[] | undefined;
}

const queue: Due[] = [];

/** Queues `part`'s client call for the end of the render (document order). */
export function queueHook(part: Due): void {
  queue.push(part);
}

/** The queue position before a render, for `runHooks`/`dropHooks`. */
export const hookMark = (): number => queue.length;

/** Runs the `client` calls queued since `mark`, in document order. */
export function runHooks(mark: number): void {
  try {
    for (let i = mark; i < queue.length; i++) {
      const part = queue[i] as Due;
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

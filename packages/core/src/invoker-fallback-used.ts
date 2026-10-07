// `#invoker-fallback` in production client-only builds (gyral-c5d.11, view/05-element.md
// "Intent events"): the fallback's loader (invoker-fallback.ts and its import()) arrives only
// through `useInvokerShim`, called by use-invokers.ts, which the preset's client-only plugin
// adds to the build when a module may make a root listen for `command` (compiler/features.ts).
// Without it the module isn't in the build's graph at all, so neither is the shim's chunk or,
// with no other import(), Vite's preload helper. Development resolves invoker-fallback.ts.
import type * as Fallback from './invoker-fallback.js';

let loader: ((root: Node) => void) | undefined;

/** Loads the fallback for `root`, when the build registered it. */
export const loadInvokerShim = ((root: Node): void => {
  loader?.(root);
}) satisfies typeof Fallback.loadInvokerShim;

/** Turns the fallback on (use-invokers.ts). */
export const useInvokerShim = ((load: (root: Node) => void): void => {
  loader = load;
}) satisfies typeof Fallback.useInvokerShim;

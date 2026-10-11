// Loading the invoker-command fallback (invokers-shim.ts, ADR 0003 tier 3), core's
// `#invoker-fallback`: a root that listens for `command` intents in a browser without
// `CommandEvent` loads it with import() (intent.ts); settled() waits. Production client-only
// builds resolve `#invoker-fallback` to invoker-fallback-used.ts, which reaches this module only
// when the build saw command intents (use-invokers.ts, gyral-c5d.11).
import { hold } from './scheduler.js';

/** Loads the fallback for `root` (once per root; the shim module loads once). */
export function loadInvokerShim(root: Node): void {
  hold(
    import('./invokers-shim.js').then((shim) => {
      shim.shimInvokers(root);
    }, reportError),
  );
}

/** Registration (use-invokers.ts) is for client-only builds; here the fallback is always on. */
export const useInvokerShim: (load: (root: Node) => void) => void = () => undefined;

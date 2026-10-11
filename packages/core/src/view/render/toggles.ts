// Dialogs and popovers from state (view/02-bindings.md "Dialogs and popovers", gyral-1zd.27):
// `?modal=${open}` on a `<dialog>` and `?popover-open=${open}` on a `[popover]` element open and
// close them with the platform's methods. The code that does it (modal.ts) registers here, so
// only builds that use the bindings bundle it: core's `#spec-features` registers it at load
// without a build step, and compiled builds register it when a module writes either binding.
import type { HookPart } from './hooks.js';

/** Queues a native action after this part's DOM is committed and inserted. */
export type Toggle = (part: HookPart, name: string, on: boolean) => void;

export let toggle: Toggle | undefined;

/** Internal: turns the bindings on (modal.ts's `applyToggle`). */
export function useToggles(run: Toggle): void {
  toggle = run;
}

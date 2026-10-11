// What `?modal` and `?popover-open` do (toggles.ts, view/02-bindings.md "Dialogs and popovers").
// `true` opens the element with the platform's method, `false` closes it; an element already in
// the asked-for state is left alone, so a dialog the user closed with Escape (the app hears its
// `close` event) isn't reopened by an unchanged model. The platform returns focus to the element
// that had it when the dialog or popover opened.
import { commitHook, defineHook } from './hook-part.js';
import type { HookPart } from './hooks.js';

// Reuse the renderer's client queue: full insertion/child renders precede native opening,
// and scheduler focus commands follow it. Loading this optional module installs the runner.
const nativeToggle = defineHook<readonly [name: string, on: boolean]>({
  client: (el, [name, on]) => {
    if (el.isConnected) openToggle(el, name, on);
  },
});

/** Queues this binding's latest value; detached/removed nodes cannot enter the top layer. */
export function applyToggle(part: HookPart, name: string, on: boolean): void {
  commitHook(part, nativeToggle(name, on));
}

/** Opens or closes a modal `<dialog>` (`modal`) or a `[popover]` element (`popover-open`). */
function openToggle(el: Element, name: string, on: boolean): void {
  if (name === 'modal') {
    const dialog = el as HTMLDialogElement;
    if (on && !dialog.open) dialog.showModal();
    else if (!on && dialog.open) dialog.close();
    return;
  }
  const popover = el as HTMLElement;
  // The Popover API is Baseline newly available: without it there is nothing to toggle.
  if (typeof popover.showPopover !== 'function') return;
  const shown = popover.matches(':popover-open');
  if (on && !shown) popover.showPopover();
  else if (!on && shown) popover.hidePopover();
}

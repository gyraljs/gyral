import { defineHook } from '@gyral/core';

/**
 * Must match the `@supports` condition in styles.ts: every anchor feature the CSS uses.
 */
export const ANCHOR_SUPPORT =
  '(anchor-name: --a) and (position-anchor: --a) and ' +
  '(position-area: block-end span-inline-end) and ' +
  '(position-try-fallbacks: flip-block) and (inline-size: anchor-size(inline))';

/**
 * The enhanced path (ADR 0003): a top-layer popover placed by CSS anchor positioning. Both are
 * needed: a top-layer popover without anchoring would sit in the middle of the viewport.
 */
export const enhanced = (): boolean =>
  typeof HTMLElement !== 'undefined' &&
  'popover' in HTMLElement.prototype &&
  typeof CSS !== 'undefined' &&
  CSS.supports(ANCHOR_SUPPORT);

let supported: boolean | undefined;

/**
 * An element hook (view/02-bindings.md "Element hooks") that shows or hides a
 * `popover="manual"` element to match model state. Without platform support it does nothing,
 * and the list stays an in-flow element shown and hidden by `?hidden`.
 */
export const popoverOpen = defineHook<[open: boolean]>({
  client: (el, [open]) => {
    supported ??= enhanced();
    if (!supported || !(el instanceof HTMLElement)) return;
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
    const shown = el.matches(':popover-open');
    // Hooks run after the commit, so the hidden attribute already changed in this render; a
    // microtask keeps the order the directive had (show after layout sees it displayable).
    queueMicrotask(() => {
      if (open && !shown && el.isConnected) el.showPopover();
      if (!open && shown) el.hidePopover();
    });
  },
});

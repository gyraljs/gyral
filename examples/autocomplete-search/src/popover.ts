import { directive, ElementDirective } from '@gyral/core';

/**
 * The enhanced path (ADR 0003): a top-layer popover placed by CSS anchor positioning. Both are
 * needed: a top-layer popover without anchoring would sit in the middle of the viewport.
 */
export const enhanced = (): boolean =>
  typeof HTMLElement !== 'undefined' &&
  'popover' in HTMLElement.prototype &&
  typeof CSS !== 'undefined' &&
  CSS.supports('anchor-name: --a');

/**
 * Shows or hides a `popover="manual"` element to match model state. Without platform support it
 * does nothing, and the list stays an in-flow element shown and hidden by `?hidden`.
 */
class PopoverOpen extends ElementDirective<[open: boolean]> {
  readonly #enabled = enhanced();

  apply(el: Element, [open]: [open: boolean]): void {
    if (!this.#enabled || !(el instanceof HTMLElement)) return;
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
    const shown = el.matches(':popover-open');
    // After the hidden attribute changes in this render, so the popover is displayable.
    queueMicrotask(() => {
      if (open && !shown && el.isConnected) el.showPopover();
      if (!open && shown) el.hidePopover();
    });
  }
}

export const popoverOpen = directive(PopoverOpen);

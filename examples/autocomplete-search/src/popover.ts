import { nothing } from 'lit';
import { Directive, directive, PartType, type ElementPart, type PartInfo } from 'lit/directive.js';

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
class PopoverOpen extends Directive {
  readonly #enabled = enhanced();

  constructor(info: PartInfo) {
    super(info);
    if (info.type !== PartType.ELEMENT) throw new Error('popoverOpen() must be used on an element');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override render(open: boolean): typeof nothing {
    return nothing;
  }

  override update(part: ElementPart, [open]: [boolean]): typeof nothing {
    const el = part.element;
    if (!this.#enabled || !(el instanceof HTMLElement)) return nothing;
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
    const shown = el.matches(':popover-open');
    // After the hidden attribute changes in this render, so the popover is displayable.
    queueMicrotask(() => {
      if (open && !shown && el.isConnected) el.showPopover();
      if (!open && shown) el.hidePopover();
    });
    return nothing;
  }
}

export const popoverOpen = directive(PopoverOpen);

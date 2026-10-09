// `capturePointer()` as an element hook (view/02-bindings.md "Element hooks", gyral-dyn.13):
// a press keeps the pointer until it is released, so a press-and-release intent sees the
// release even when it happens outside the element (view/05-element.md "Press and release").
import { defineDisposableHook } from '../view/index.js';

// One shared listener: adding it again to the same element is a no-op (DOM dedupes it).
function capture(this: Element, event: Event): void {
  try {
    this.setPointerCapture((event as PointerEvent).pointerId);
  } catch {
    // Not an active pointer (a synthetic event): there is nothing to capture.
  }
}

/**
 * Captures the pointer on the element when it is pressed (`setPointerCapture`), so
 * `pointerup` and `pointercancel` arrive at the element wherever the pointer goes:
 *
 *   <button ${capturePointer()} data-intent=${i.Hold}
 *     data-intent-on="pointerdown pointerup pointercancel">
 *
 * A hook rather than built into intents, so only apps that use it bundle it. Disposable: a
 * position that stops holding it (`${held ? capturePointer() : nothing}`) removes the listener.
 */
export const capturePointer = defineDisposableHook<[]>({
  client: (el) => {
    el.addEventListener('pointerdown', capture);
  },
  dispose: (el) => {
    el.removeEventListener('pointerdown', capture);
  },
});

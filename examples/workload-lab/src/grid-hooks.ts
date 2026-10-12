import { defineHook } from '@gyral/core';

interface InputOwner {
  readonly stop: () => void;
  readonly blur: () => void;
  readonly visibility: () => void;
  readonly capture: (event: Event) => void;
  readonly focus: (event: Event) => void;
}
const inputs = new WeakMap<Element, InputOwner>();
export const ownGridInput = defineHook<[]>({
  client: (el) => {
    let pointer: number | undefined;
    const stop = (): void => {
      if (pointer !== undefined && el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      pointer = undefined;
      el.dispatchEvent(new CustomEvent('grid-stop'));
    };
    const visibility = (): void => {
      if (document.hidden) stop();
    };
    const focus = (event: Event): void => {
      if (
        event instanceof FocusEvent &&
        (!(event.relatedTarget instanceof Node) || !el.contains(event.relatedTarget))
      )
        stop();
    };
    const capture = (event: Event): void => {
      if (!(event instanceof PointerEvent) || event.button !== 0 || !event.isPrimary) return;
      el.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
    };
    inputs.set(el, { stop, blur: stop, visibility, capture, focus });
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    el.addEventListener('focusout', focus);
    el.addEventListener('pointerdown', capture);
  },
  dispose: (el) => {
    const owner = inputs.get(el);
    if (owner === undefined) return;
    owner.stop();
    window.removeEventListener('blur', owner.blur);
    document.removeEventListener('visibilitychange', owner.visibility);
    el.removeEventListener('focusout', owner.focus);
    el.removeEventListener('pointerdown', owner.capture);
    inputs.delete(el);
  },
});

/** A description in this component's ancestor document; never an IDREF across roots. */
export const gridDescription = defineHook<[fallbackOnly?: boolean]>({
  client: (el, [fallbackOnly]) => {
    const description = document.getElementById('grid-description');
    if (description !== null && !fallbackOnly && 'ariaDescribedByElements' in el) {
      (el as Element & { ariaDescribedByElements: Element[] }).ariaDescribedByElements = [
        description,
      ];
    } else el.setAttribute('aria-describedby', 'grid-instructions');
  },
});

interface CanvasOwner {
  alive: boolean;
  readonly observer: ResizeObserver;
  draw: () => void;
  readonly fonts: () => void;
}
const canvases = new WeakMap<Element, CanvasOwner>();
export const gridCanvas = defineHook<[cell: number]>({
  client: (el, [cell]) => {
    if (!(el instanceof HTMLCanvasElement)) return;
    const draw = (): void => {
      if (document.fonts.status === 'loading') {
        el.dataset['ready'] = 'false';
        return;
      }
      const context = el.getContext('2d');
      if (context === null) return;
      context.clearRect(0, 0, el.width, el.height);
      context.fillStyle = getComputedStyle(el).color;
      context.font = '16px system-ui';
      context.fillText(`Selected cell ${String(cell + 1)}`, 12, 28);
      context.beginPath();
      context.arc(20 + (cell % 5) * 40, 60, 8, 0, Math.PI * 2);
      context.fill();
      el.dataset['ready'] = 'true';
    };
    const existing = canvases.get(el);
    if (existing !== undefined) {
      existing.draw = draw;
      draw();
      return;
    }
    const owner: CanvasOwner = {
      alive: true,
      draw,
      observer: new ResizeObserver(() => {
        if (owner.alive) owner.draw();
      }),
      fonts: () => {
        if (owner.alive) owner.draw();
      },
    };
    canvases.set(el, owner);
    owner.observer.observe(el);
    document.fonts.addEventListener('loadingdone', owner.fonts);
    void document.fonts.ready.then(() => {
      if (owner.alive) owner.draw();
    });
  },
  dispose: (el) => {
    const owner = canvases.get(el);
    if (owner === undefined) return;
    owner.alive = false;
    owner.observer.disconnect();
    document.fonts.removeEventListener('loadingdone', owner.fonts);
    if (el instanceof HTMLElement) el.dataset['ready'] = 'false';
    canvases.delete(el);
  },
});

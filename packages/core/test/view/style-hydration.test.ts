// view/08-styles.md "Style attributes under a strict CSP" (0.3.1, gyral-dyn.5): server-rendered
// style attributes (bound, multi and static) are adopted without a write, the development
// check compares them as written, and later updates go through the CSSOM. A style attribute
// whose declarations didn't apply (a strict CSP blocked it; simulated here) is written again
// through the CSSOM. Runs against development and production builds of core.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { html, hydrate, render } from '../../src/view/index.js';
import { cleanup, nodesOf, serverDom } from './hydrate-helpers.js';
import { watch } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const view = (w: number, c: string) =>
  html`<div style=${`--w: ${String(w)}px`}>
    <p style="width: ${w}px; color: ${c}">a</p>
    <svg style="fill: red"><rect style=${`opacity: ${String(w / 10)}`} /></svg>
  </div>`;

describe('hydrating style attributes', () => {
  it('adopts them without a write, then updates through the CSSOM', () => {
    for (const dev of [true, false]) {
      const root = serverDom(view(3, 'red'), dev);
      const before = nodesOf(root);
      const changes = watch(root);
      hydrate(view(3, 'red'), root);
      expect(changes.take().filter((m) => m.type === 'attributes')).toEqual([]);
      const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
      render(view(4, 'blue'), root);
      const div = root.querySelector('div') as HTMLElement;
      const p = root.querySelector('p') as HTMLElement;
      expect(div.style.getPropertyValue('--w')).toBe('4px');
      expect([p.style.width, p.style.color]).toEqual(['4px', 'blue']);
      expect((root.querySelector('rect') as SVGRectElement).style.opacity).toBe('0.4');
      expect((root.querySelector('svg') as SVGSVGElement).style.fill).toBe('red');
      expect(setAttribute.mock.calls.filter(([name]) => name === 'style')).toEqual([]);
      expect(nodesOf(root).filter((n) => n.nodeType === 1)).toEqual(
        before.filter((n) => n.nodeType === 1),
      );
      setAttribute.mockRestore();
    }
  });

  it('applies a style attribute without declarations again (as a strict CSP leaves it)', () => {
    const root = serverDom(view(3, 'red'));
    // Firefox empties a blocked attribute; Chromium and WebKit keep its text undeclared.
    for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[style]')) {
      el.setAttribute('style', '');
    }
    hydrate(view(3, 'red'), root);
    const p = root.querySelector('p') as HTMLElement;
    expect((root.querySelector('div') as HTMLElement).style.getPropertyValue('--w')).toBe('3px');
    expect([p.style.width, p.style.color]).toEqual(['3px', 'red']);
    expect((root.querySelector('svg') as SVGSVGElement).style.fill).toBe('red');
    expect((root.querySelector('rect') as SVGRectElement).style.opacity).toBe('0.3');
  });
});

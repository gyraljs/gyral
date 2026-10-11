// view/02-bindings.md "Style attributes" (0.3.1, gyral-dyn.5): `style` bindings and static
// `style` attributes are written through the CSSOM (`.style.cssText`), never `setAttribute`,
// so a strict CSP (`style-src` without 'unsafe-inline') doesn't block them; parts still write
// only when their value changes. The CSP itself is tested in style-csp.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { html, nothing, templateElement, templateOf } from '../../src/view/index.js';
import { draw, mount, watch } from './render-helpers.js';

let setAttribute: MockInstance<Element['setAttribute']>;

beforeEach(() => {
  setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** The `style` writes that went through `setAttribute` (there must be none). */
const styleAttributeWrites = (): unknown[][] =>
  setAttribute.mock.calls.filter(([name]) => name.toLowerCase() === 'style');

describe('style bindings (02 "Style attributes")', () => {
  const view = (v: unknown) => html`<p style=${v}>x</p>`;

  it('write through the CSSOM, custom properties included', () => {
    const el = mount();
    draw(el, view('color: rgb(1, 2, 3); --w: 4px'));
    const p = el.querySelector('p') as HTMLElement;
    expect(getComputedStyle(p).color).toBe('rgb(1, 2, 3)');
    expect(p.style.getPropertyValue('--w')).toBe('4px');
    draw(el, view('--w: 5px'));
    expect(p.style.color).toBe('');
    expect(p.style.getPropertyValue('--w')).toBe('5px');
    expect(styleAttributeWrites()).toEqual([]);
  });

  it('remove the attribute for null, undefined and nothing', () => {
    for (const absent of [null, undefined, nothing]) {
      const el = mount();
      draw(el, view('color: red'));
      expect(draw(el, view(absent))).toBe('<p>x</p>');
      draw(el, view('color: blue'));
      expect((el.querySelector('p') as HTMLElement).style.color).toBe('blue');
    }
    expect(styleAttributeWrites()).toEqual([]);
  });

  it('compare with the committed value, not the serialized cssText', () => {
    const el = mount();
    draw(el, view('color:red'));
    const changes = watch(el);
    draw(el, view('color:red'));
    expect(changes.take()).toEqual([]);
    draw(el, view('color:blue'));
    expect(changes.take()).toHaveLength(1);
  });

  it('join multi-attributes and write the joined text through the CSSOM', () => {
    const multi = (w: unknown, c: unknown) => html`<p style="width: ${w}px; color: ${c}">x</p>`;
    const el = mount();
    draw(el, multi(3, 'red'));
    const p = el.querySelector('p') as HTMLElement;
    expect([p.style.width, p.style.color]).toEqual(['3px', 'red']);
    const changes = watch(el);
    draw(el, multi(3, 'red'));
    expect(changes.take()).toEqual([]);
    draw(el, multi(4, 'red'));
    expect(p.style.width).toBe('4px');
    draw(el, multi(nothing, 'red'));
    expect(p.hasAttribute('style')).toBe(false);
    draw(el, multi(5, 'blue'));
    expect([p.style.width, p.style.color]).toEqual(['5px', 'blue']);
    expect(styleAttributeWrites()).toEqual([]);
  });

  it('write SVG elements through their CSSOM too', () => {
    const icon = (fill: string, w: number) =>
      html`<svg style=${`--fill: ${fill}`}><rect style="stroke-width: ${w}px" /></svg>`;
    const el = mount();
    draw(el, icon('red', 2));
    const svg = el.querySelector('svg') as SVGSVGElement;
    const rect = el.querySelector('rect') as SVGRectElement;
    expect(svg.style.getPropertyValue('--fill')).toBe('red');
    expect(rect.style.strokeWidth).toBe('2px');
    draw(el, icon('blue', 3));
    expect(svg.style.getPropertyValue('--fill')).toBe('blue');
    expect(rect.style.strokeWidth).toBe('3px');
    expect(styleAttributeWrites()).toEqual([]);
  });

  it('leave property bindings alone: `.style` sets the property', () => {
    const el = mount();
    draw(el, html`<p .style=${'--x: 1'}>x</p>`);
    expect((el.querySelector('p') as HTMLElement).style.getPropertyValue('--x')).toBe('1');
  });
});

describe('static style attributes (01 "Normalization")', () => {
  const view = (n: number) => html`<p class="a" style='color: rgb(1, 2, 3); --k: "q"'>${n}</p>`;

  it('are not in the <template> HTML and are applied once, through the CSSOM', () => {
    expect(templateElement(templateOf(view(0))).innerHTML).toBe('<p class="a"></p>');
    const el = mount();
    draw(el, view(1));
    const p = el.querySelector('p') as HTMLElement;
    expect(getComputedStyle(p).color).toBe('rgb(1, 2, 3)');
    expect(p.style.getPropertyValue('--k')).toBe('"q"');
    const changes = watch(el);
    draw(el, view(2));
    expect(changes.take().filter((m) => m.type === 'attributes')).toEqual([]);
    expect(styleAttributeWrites()).toEqual([]);
  });

  it('apply to every instance, on SVG elements, and before child components connect', () => {
    const el = mount();
    draw(
      el,
      html`${[1, 2].map((n) => html`<svg style="--n: 1"><g style="opacity: 0.5">${n}</g></svg>`)}`,
    );
    const svgs = el.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg.style.getPropertyValue('--n')).toBe('1');
      expect((svg.firstElementChild as SVGGElement).style.opacity).toBe('0.5');
    }
    class Probe extends HTMLElement {
      seen = '';
      connectedCallback(): void {
        this.seen = this.style.getPropertyValue('--at-connect');
      }
    }
    customElements.define('style-probe', Probe);
    draw(el, html`<style-probe style="--at-connect: yes"></style-probe>`);
    expect((el.querySelector('style-probe') as Probe).seen).toBe('yes');
    expect(styleAttributeWrites()).toEqual([]);
  });
});

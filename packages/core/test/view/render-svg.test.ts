// view/01-templates.md "svg templates" in Chromium: svg`…` fragments rendered inside an <svg>
// of an html template are SVG elements (namespace, camelCase names), their parts work like
// html templates' (attributes, text, nested and conditional fragments, `each` rows), and
// rendering one outside SVG content is a development error.
import { afterEach, describe, expect, it } from 'vitest';
import { each, html, nothing, svg } from '../../src/view/index.js';
import { templateElement, templateOf } from '../../src/view/index.js';
import { draw, mount, watch } from './render-helpers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

afterEach(() => {
  document.body.replaceChildren();
});

const card = (body: unknown) => html`<svg viewBox="0 0 10 10">${body}</svg>`;

describe('svg templates in the browser (view/01 "svg templates")', () => {
  it('creates SVG elements, with camelCase names and attributes as the parser spells them', () => {
    const el = mount();
    draw(
      el,
      card(
        svg`<clipPath id="c"><rect width="1"/></clipPath><linearGradient gradientTransform=${'rotate(9)'}/>`,
      ),
    );
    const clip = el.querySelector('svg > *');
    expect(clip?.namespaceURI).toBe(SVG_NS);
    expect(clip?.localName).toBe('clipPath');
    expect(clip?.firstElementChild?.namespaceURI).toBe(SVG_NS);
    const gradient = clip?.nextElementSibling;
    expect(gradient?.localName).toBe('linearGradient');
    expect(gradient?.getAttribute('gradientTransform')).toBe('rotate(9)');
    expect(gradient instanceof SVGLinearGradientElement).toBe(true);
  });

  it('keeps the template content in the SVG namespace (the <svg> wrapper is unwrapped)', () => {
    const result = svg`<path d="M0 0"/>${'t'}`;
    const content = templateElement(templateOf(result)).content;
    expect([...content.childNodes].map((n) => n.nodeName)).toEqual(['path']);
    expect((content.firstChild as Element).namespaceURI).toBe(SVG_NS);
  });

  it('updates attribute parts (d, transform, viewBox) and writes only on change', () => {
    const el = mount();
    const view = (d: string, r: number, box: string) =>
      html`<svg viewBox=${box}>${svg`<path d=${d} transform="rotate(${r})"/>`}</svg>`;
    draw(el, view('M0 0', 1, '0 0 1 1'));
    const path = el.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M0 0');
    expect(path?.getAttribute('transform')).toBe('rotate(1)');
    const changes = watch(el);
    draw(el, view('M0 0', 1, '0 0 1 1'));
    expect(changes.take()).toEqual([]);
    draw(el, view('M1 1', 2, '0 0 2 2'));
    expect(el.querySelector('path')).toBe(path);
    expect(path?.getAttribute('d')).toBe('M1 1');
    expect(path?.getAttribute('transform')).toBe('rotate(2)');
    expect(el.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 2 2');
    expect(changes.take()).toHaveLength(3);
  });

  it('binds lower-case spellings to SVG attributes (viewbox → viewBox), like the parser', () => {
    const el = mount();
    draw(el, card(svg`<svg viewbox=${'0 0 3 3'} ?pathlength=${true}></svg>`));
    const inner = el.querySelector('svg svg');
    expect(inner?.getAttribute('viewBox')).toBe('0 0 3 3');
    expect(inner?.hasAttribute('pathLength')).toBe(true);
  });

  it('renders text content in <text> and <tspan>, escaped', () => {
    const el = mount();
    const view = (name: string) => card(svg`<text x="1">${name} <tspan>${'<b>'}</tspan></text>`);
    draw(el, view('Han'));
    const text = el.querySelector('text');
    expect(text?.textContent).toBe('Han <b>');
    draw(el, view('Lando'));
    expect(el.querySelector('text')).toBe(text);
    expect(text?.textContent).toBe('Lando <b>');
    expect(text?.querySelector('b')).toBeNull();
  });

  it('switches conditional svg parts (cond ? svg`…` : nothing)', () => {
    const el = mount();
    const mark = (suit: string | undefined) =>
      card(
        svg`<g class="face">${suit === undefined ? nothing : svg`<path class=${suit} d="M0 0"/>`}</g>`,
      );
    draw(el, mark(undefined));
    expect(el.querySelector('g')?.childNodes).toHaveLength(0);
    draw(el, mark('circle'));
    const path = el.querySelector('g > path');
    expect(path?.namespaceURI).toBe(SVG_NS);
    expect(path?.getAttribute('class')).toBe('circle');
    draw(el, mark('square'));
    expect(el.querySelector('g > path')).toBe(path);
    expect(path?.getAttribute('class')).toBe('square');
    draw(el, mark(undefined));
    expect(el.querySelector('g')?.childNodes).toHaveLength(0);
  });

  it('nests svg templates, and mixes them with html templates in <foreignObject>', () => {
    const el = mount();
    const inner = svg`<circle r=${2}/>`;
    draw(
      el,
      card(
        svg`<g>${svg`<g class="in">${inner}</g>`}<foreignObject width="5" height="5">${html`<p>${'hi'}</p>`}</foreignObject></g>`,
      ),
    );
    const circle = el.querySelector('g.in > circle');
    expect(circle?.namespaceURI).toBe(SVG_NS);
    expect(circle?.getAttribute('r')).toBe('2');
    const p = el.querySelector('foreignObject > p');
    expect(p?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
    expect(p?.textContent).toBe('hi');
  });

  it('renders each rows of svg templates, keyed, and moves them', () => {
    const el = mount();
    const view = (ids: readonly number[]) =>
      card(
        svg`<g>${each(
          ids,
          (id) => id,
          (id) => svg`<rect x=${id} width="1"/>`,
        )}</g>`,
      );
    draw(el, view([1, 2, 3]));
    const rects = [...el.querySelectorAll('rect')];
    expect(rects.map((r) => r.getAttribute('x'))).toEqual(['1', '2', '3']);
    expect(rects.every((r) => r.namespaceURI === SVG_NS)).toBe(true);
    draw(el, view([3, 1]));
    const after = [...el.querySelectorAll('rect')];
    expect(after.map((r) => r.getAttribute('x'))).toEqual(['3', '1']);
    expect(after[0]).toBe(rects[2]);
    expect(after[1]).toBe(rects[0]);
  });

  it('renders root-level holes and several top-level nodes of an svg template', () => {
    const el = mount();
    const view = (a: string) => card(svg`${a}<path d="M0"/>${svg`<g></g>`} tail`);
    draw(el, view('a'));
    const root = el.querySelector('svg');
    expect(root?.textContent).toBe('a tail');
    expect([...(root?.children ?? [])].map((c) => c.localName)).toEqual(['path', 'g']);
    draw(el, view('b'));
    expect(root?.textContent).toBe('b tail');
  });

  it('is a development error outside SVG content', () => {
    const el = mount();
    expect(() => draw(el, svg`<path d="M0"/>`)).toThrow(/svg template is rendered into <div>/);
    expect(() => draw(mount(), html`<p>${svg`<g></g>`}</p>`)).toThrow(/isn't SVG content/);
    expect(() => draw(mount(), card(svg`<foreignObject>${svg`<g></g>`}</foreignObject>`))).toThrow(
      /<foreignObject>/,
    );
  });
});

// view/02-bindings.md "Child values" and "Commit order" in Chromium: the value table, kind
// changes, template identity by id, positional arrays, and render() caching per root.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { each, html, nothing, raw, render } from '../../src/view/index.js';
import { draw, fresh, mount, watch } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('child values (view/02 "Child values")', () => {
  it('renders strings and numbers as one Text node, updated in place', () => {
    const el = mount();
    expect(draw(el, html`<p>${'a'}</p>`)).toBe('<p>a</p>');
    const text = el.querySelector('p')?.firstChild;
    expect(draw(el, html`<p>${42}</p>`)).toBe('<p>42</p>');
    expect(el.querySelector('p')?.firstChild).toBe(text);
    expect(text?.nodeType).toBe(Node.TEXT_NODE);
  });

  it('renders an empty string as an empty Text node', () => {
    const el = mount();
    draw(el, html`<p>${''}</p>`);
    expect(el.querySelector('p')?.childNodes.length).toBe(1);
  });

  it('renders null, undefined, false and nothing as nothing', () => {
    for (const value of [null, undefined, false, nothing]) {
      const el = mount();
      expect(draw(el, html`<p>${'x'}</p>`)).toBe('<p>x</p>');
      expect(draw(el, html`<p>${value}</p>`)).toBe('<p></p>');
      expect(el.querySelector('p')?.childNodes.length).toBe(0);
    }
    const when = (open: boolean) => html`<p>${open && html`<b>on</b>`}</p>`;
    expect(fresh(when(true))).toBe('<p><b>on</b></p>');
    expect(fresh(when(false))).toBe('<p></p>');
  });

  it('renders true as nothing, with a development warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(fresh(html`<p>${true}</p>`)).toBe('<p></p>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cond && x'));
  });

  it('throws in development for any other object or function', () => {
    const el = mount();
    for (const value of [{ a: 1 }, () => 1, Symbol('s'), new Date()]) {
      expect(() => {
        render(html`<p>${value}</p>`, el);
      }).toThrow(/child hole got/);
    }
    // JSON can't carry the module-private symbols, so data never passes for a result.
    const forged = JSON.parse('{"values": [], "strings": ["<b>x</b>"]}') as never;
    expect(() => {
      render(forged, mount());
    }).toThrow(TypeError);
  });

  it('updates the parts of the same template and keeps its nodes', () => {
    const el = mount();
    const view = (n: number) => html`<p class=${`c${String(n)}`}>${n}</p>`;
    draw(el, view(1));
    const p = el.querySelector('p');
    expect(draw(el, view(2))).toBe('<p class="c2">2</p>');
    expect(el.querySelector('p')).toBe(p);
  });

  it('reuses the instance for another call site with the same template id', () => {
    const a = (v: string) => html`<p>${v}</p>`;
    const b = (v: string) => html`<p>${v}</p>`;
    const el = mount();
    draw(el, a('one'));
    const p = el.querySelector('p');
    expect(draw(el, b('two'))).toBe('<p>two</p>');
    expect(el.querySelector('p')).toBe(p);
  });

  it('replaces the instance when the template id changes', () => {
    const el = mount();
    draw(el, html`<div>${html`<p>a</p>`}</div>`);
    const p = el.querySelector('p');
    expect(draw(el, html`<div>${html`<span>b</span>`}</div>`)).toBe('<div><span>b</span></div>');
    expect(p?.isConnected).toBe(false);
  });

  it('removes the old content and creates the new one on every kind change', () => {
    const el = mount();
    const view = (v: unknown) => html`<div>${v}<i></i></div>`;
    const steps: [unknown, string][] = [
      ['text', 'text'],
      [html`<b>${1}</b>`, '<b>1</b>'],
      [
        each(
          [1, 2],
          (n) => n,
          (n) => html`<u>${n}</u>`,
        ),
        '<u>1</u><u>2</u>',
      ],
      [['x', html`<s>y</s>`], 'x<s>y</s>'],
      [raw('<em>r</em>'), '<!----><em>r</em>'],
      [nothing, ''],
      [7, '7'],
    ];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const [value, inner] of steps) {
      expect(draw(el, view(value))).toBe(`<div>${inner}<i></i></div>`);
    }
    for (const [value] of steps) {
      for (const [next, inner] of steps) {
        draw(el, view(value));
        expect(draw(el, view(next))).toBe(`<div>${inner}<i></i></div>`);
      }
    }
  });
});

describe('positional arrays (view/02 "Child values")', () => {
  it('reuses items by index and keeps their nodes', () => {
    const el = mount();
    draw(el, html`<p>${['a', 'b', 'c']}</p>`);
    const nodes = [...(el.querySelector('p')?.childNodes ?? [])];
    expect(draw(el, html`<p>${['x', 'b', 'z']}</p>`)).toBe('<p>xbz</p>');
    expect([...(el.querySelector('p')?.childNodes ?? [])]).toEqual(nodes);
  });

  it('replaces only the item whose template changed', () => {
    const el = mount();
    const A = (v: string) => html`<b>${v}</b>`;
    const B = (v: string) => html`<i>${v}</i>`;
    draw(el, html`<p>${[A('1'), A('2'), A('3')]}</p>`);
    const [first, second, third] = [...(el.querySelector('p')?.children ?? [])];
    expect(draw(el, html`<p>${[A('1'), B('2'), A('4')]}</p>`)).toBe(
      '<p><b>1</b><i>2</i><b>4</b></p>',
    );
    const now = [...(el.querySelector('p')?.children ?? [])];
    expect(now[0]).toBe(first);
    expect(now[1]).not.toBe(second);
    expect(now[2]).toBe(third);
  });

  it('grows, shrinks, nests and holds empty items', () => {
    const el = mount();
    const view = (v: unknown[]) => html`<p>${v}<br /></p>`;
    expect(draw(el, view(['a']))).toBe('<p>a<br></p>');
    expect(draw(el, view(['a', null, ['b', 'c'], 'd']))).toBe('<p>abcd<br></p>');
    expect(draw(el, view([null, 'x', [], 'd']))).toBe('<p>xd<br></p>');
    expect(draw(el, view(['q', 'x', ['n'], 'd']))).toBe('<p>qxnd<br></p>');
    expect(draw(el, view([]))).toBe('<p><br></p>');
    expect(draw(el, view(['z']))).toBe('<p>z<br></p>');
  });
});

describe('render() (view/02 "Commit order")', () => {
  it('caches the root part per root and updates in place', () => {
    const el = mount();
    draw(el, html`<p>${1}</p>`);
    const p = el.querySelector('p');
    const changes = watch(el);
    draw(el, html`<p>${1}</p>`);
    expect(changes.take()).toEqual([]);
    expect(el.querySelector('p')).toBe(p);
  });

  it('renders into shadow roots and document fragments', () => {
    const host = mount();
    const shadow = host.attachShadow({ mode: 'open' });
    expect(draw(shadow, html`<p>${'s'}</p>`)).toBe('<p>s</p>');
    const frag = document.createDocumentFragment();
    expect(draw(frag, html`a${'b'}<i></i>`)).toBe('ab<i></i>');
    expect(draw(frag, html`a${'c'}<i></i>`)).toBe('ac<i></i>');
  });

  it('commits parts before inserting an instance, so child elements connect with props set', () => {
    const seen: unknown[] = [];
    class PropsProbe extends HTMLElement {
      items: unknown;
      connectedCallback(): void {
        seen.push(this.items);
      }
    }
    customElements.define('props-probe', PropsProbe);
    render(html`<div><props-probe .items=${[1, 2]}></props-probe></div>`, mount());
    expect(seen).toEqual([[1, 2]]);
  });

  it('leaves the DOM unchanged when a value throws in development', () => {
    const el = mount();
    draw(el, html`<p>${'ok'}</p>`);
    expect(() => {
      render(html`<p>${{}}</p>`, el);
    }).toThrow();
    expect(el.innerHTML).toBe('<p>ok</p>');
  });
});

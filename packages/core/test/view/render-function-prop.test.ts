// view/02-bindings.md "Properties" (gyral-g1r.28): views attach no closures, so a function in a
// property binding warns in development, once per part: on built-in elements (`.onclick`) and
// on Gyral components (props are data, carried by seeds). Other custom elements may take a
// callback (a third-party widget's API) and don't warn.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, settled, type Stateless } from '../../src/index.js';
import { html, render, svg } from '../../src/view/index.js';
import { mount } from './render-helpers.js';

const handler = (): void => undefined;
const other = (): void => undefined;

define<Stateless, never>('test-fn-prop', {
  intent: {},
  update: {},
  view: () => html`<p>x</p>`,
});

class ThirdParty extends HTMLElement {
  renderer: unknown;
}
customElements.define('third-party-fn', ThirdParty);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('a function in a property binding (development)', () => {
  it('warns once per part on a built-in element, and still sets it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = mount();
    const view = (fn: unknown) => html`<button .onclick=${fn}>go</button>`;
    render(view(handler), el);
    render(view(other), el);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(
      /\.onclick=\$\{…\} on <button> got a function\. Views attach no closures: name an intent/,
    );
    expect(el.querySelector('button')?.onclick).toBe(other);
  });

  it('warns on an SVG element in an svg template too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = mount();
    render(html`<svg>${svg`<circle r="1" .onclick=${handler}></circle>`}</svg>`, el);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/\.onclick=\$\{…\} on <circle> got a function/);
    expect(el.querySelector('circle')?.onclick).toBe(handler);
  });

  it('warns on a Gyral component: props are data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = mount();
    render(html`<test-fn-prop .format=${handler}></test-fn-prop>`, el);
    await settled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(
      /<test-fn-prop> got a function.*props are data/,
    );
  });

  it("doesn't warn on another library's custom element, or for data", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = mount();
    render(
      html`<third-party-fn .renderer=${handler}></third-party-fn>
        <div .data=${{ a: 1 }}></div>`,
      el,
    );
    expect(warn).not.toHaveBeenCalled();
    expect(el.querySelector<ThirdParty>('third-party-fn')?.renderer).toBe(handler);
  });
});

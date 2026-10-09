// keyed(key, value) (view/03-lists.md "keyed"): the value updates in place while its key stays
// the same, and is recreated (DOM and nested component state) when the key changes; on the
// server it renders like any child value and hydration adopts it.
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, keyed, settled } from '../src/index.js';
import { renderToString } from '../src/server.js';
import { hydrate, render } from '../src/view/index.js';
import { cleanup, container, serverDom } from './view/hydrate-helpers.js';

afterEach(cleanup);

const box = (label: string) => html`<p class="box">${label}</p>`;

describe('keyed', () => {
  it('updates in place while the key is the same', () => {
    const el = container();
    render(html`<div>${keyed(1, box('a'))}</div>`, el);
    const p = el.querySelector('p');
    render(html`<div>${keyed(1, box('b'))}</div>`, el);
    expect(el.querySelector('p')).toBe(p);
    expect(p?.textContent).toBe('b');
  });

  it('replaces the DOM when the key changes', () => {
    const el = container();
    render(html`<div>${keyed('x', box('a'))}</div>`, el);
    const p = el.querySelector('p');
    render(html`<div>${keyed('y', box('a'))}</div>`, el);
    const q = el.querySelector('p');
    expect(q).not.toBe(p);
    expect(p?.isConnected).toBe(false);
    expect(el.querySelectorAll('p')).toHaveLength(1);
  });

  it('keeps form controls as the user left them until the key changes', () => {
    const el = container();
    const field = html`<input name="note" />`;
    render(keyed(0, field), el);
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'typed';
    render(keyed(0, field), el);
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('typed');
    render(keyed(1, field), el);
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it("resets a nested component's state", async () => {
    type Msg = { readonly _tag: 'Up' };
    define<{ readonly n: number }, Msg>()('keyed-count', {
      init: () => ({ n: 0 }),
      intent: { Up: () => ({ _tag: 'Up' }) },
      update: { Up: (s) => ({ n: s.n + 1 }) },
      view: (s, i) => html`<button data-intent=${i.Up}>${s.n}</button>`,
    });
    const el = container();
    render(keyed(1, html`<keyed-count></keyed-count>`), el);
    await settled();
    const first = el.querySelector('keyed-count') as HTMLElement;
    first.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(first.shadowRoot?.querySelector('button')?.textContent).toBe('1');

    render(keyed(1, html`<keyed-count></keyed-count>`), el);
    await settled();
    expect(el.querySelector('keyed-count')).toBe(first);

    render(keyed(2, html`<keyed-count></keyed-count>`), el);
    await settled();
    const second = el.querySelector('keyed-count') as HTMLElement;
    expect(second).not.toBe(first);
    expect(second.shadowRoot?.querySelector('button')?.textContent).toBe('0');
  });

  it('renders on the server like the value itself', () => {
    expect(renderToString(html`<div>${keyed(3, box('a'))}</div>`, { dev: false })).toBe(
      renderToString(html`<div>${box('a')}</div>`, { dev: false }),
    );
  });

  it('hydrates in place, then recreates on a new key', () => {
    for (const dev of [true, false]) {
      const view = (k: number, label: string) => html`<div>${keyed(k, box(label))}</div>`;
      const root = serverDom(view(1, 'a'), dev);
      const p = root.querySelector('p');
      hydrate(view(1, 'a'), root);
      expect(root.querySelector('p')).toBe(p);
      render(view(1, 'b'), root);
      expect(root.querySelector('p')).toBe(p);
      expect(p?.textContent).toBe('b');
      render(view(2, 'b'), root);
      expect(root.querySelector('p')).not.toBe(p);
      cleanup();
    }
  });
});

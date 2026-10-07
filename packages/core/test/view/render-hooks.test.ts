// view/02-bindings.md "Element hooks" and "Commit order" in Chromium: `client` runs after the
// commit, in document order, only when the arguments changed (shallow Object.is), with `prev`
// undefined the first time; render() returns after every call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineHook, each, html, nothing, render } from '../../src/view/index.js';
import { mount } from './render-helpers.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('element hooks (view/02 "Element hooks")', () => {
  it('calls client with the element, the args and the previous args', () => {
    const calls: unknown[][] = [];
    const mark = defineHook<[label: string, n?: number]>({
      client: (el, args, prev) => calls.push([el.localName, args, prev]),
    });
    const el = mount();
    const view = (label: string, n?: number) => html`<p ${mark(label, n)}>x</p>`;
    render(view('a', 1), el);
    render(view('a', 1), el); // same args: no call
    render(view('b', 1), el);
    render(view('b'), el); // one fewer argument: a change
    expect(calls).toEqual([
      ['p', ['a', 1], undefined],
      ['p', ['b', 1], ['a', 1]],
      ['p', ['b', undefined], ['b', 1]],
    ]);
  });

  it('compares arguments shallowly with Object.is', () => {
    const client = vi.fn();
    const hook = defineHook<[value: unknown]>({ client });
    const el = mount();
    const list = [1];
    for (const v of [list, list, [1], NaN, NaN, 0, -0]) render(html`<i ${hook(v)}></i>`, el);
    expect(client).toHaveBeenCalledTimes(5);
  });

  it('runs after the instance committed and was inserted, in document order', () => {
    const order: string[] = [];
    const probe = defineHook<[name: string]>({
      client: (el, [name]) => {
        order.push(`${name}:${String(el.isConnected)}:${el.textContent}`);
      },
    });
    const el = mount();
    render(
      html`<div ${probe('outer')}>
        ${'text'}
        <p ${probe('p')}>${html`<b ${probe('b')}>${'bold'}</b>`}</p>
        ${each(
          [1, 2],
          (n) => n,
          // eslint-disable-next-line gyral/each-row-purity -- a test-local hook (apps define hooks at module level)
          (n) => html`<i ${probe(`row${String(n)}`)}>${n}</i>`,
        )}
      </div>`,
      el,
    );
    expect(order).toEqual([
      'outer:true:textbold12',
      'p:true:bold',
      'b:true:bold',
      'row1:true:1',
      'row2:true:2',
    ]);
  });

  it('starts over with prev undefined when another hook takes the position', () => {
    const calls: unknown[] = [];
    const a = defineHook<[n: number]>({ client: (_, args, prev) => calls.push(['a', prev]) });
    const b = defineHook<[n: number]>({ client: (_, args, prev) => calls.push(['b', prev]) });
    const el = mount();
    const view = (h: typeof a, n: number) => html`<i ${h(n)}></i>`;
    render(view(a, 1), el);
    render(view(b, 1), el);
    render(view(b, 2), el);
    expect(calls).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['b', [1]],
    ]);
  });

  it('accepts nothing, null and undefined for no hook', () => {
    const client = vi.fn();
    const hook = defineHook<[]>({ client });
    const el = mount();
    for (const v of [nothing, hook(), null, hook(), undefined]) render(html`<i ${v}></i>`, el);
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('throws in development for anything else in a hook position', () => {
    expect(() => {
      render(html`<i ${'class="x"'}></i>`, mount());
    }).toThrow(/element hook position/);
  });

  it('drops queued calls when a render throws, and runs none of them', () => {
    const client = vi.fn();
    const hook = defineHook<[]>({ client });
    const el = mount();
    expect(() => {
      render(html`<p ${hook()}>${{}}</p>`, el);
    }).toThrow();
    render(html`<b></b>`, el);
    expect(client).not.toHaveBeenCalled();
  });
});

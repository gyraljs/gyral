// view/02-bindings.md "Widgets with a lifecycle": `dispose(el, args)` runs when the hook's
// element leaves its render root (part cleared, instance replaced, row removed, list cleared;
// noticed after the commit, so the element is already out of the DOM), when the position stops
// holding the hook, and when its host disconnects; never on moves. After a reconnect, `client`
// runs again with `prev` undefined (gyral-c5d.2).
import { afterEach, describe, expect, it } from 'vitest';
import { define, settled } from '../../src/index.js';
import {
  defineDisposableHook,
  defineHook,
  each,
  html,
  hydrate,
  nothing,
  render,
} from '../../src/view/index.js';
import { mount } from './render-helpers.js';

type Call = readonly [what: string, name: string, args: unknown, prev?: unknown];

/** A hook that logs `client` and `dispose` calls, with the element's id or tag name. */
function logged(log: Call[]) {
  const name = (el: Element) => el.id || el.localName;
  return defineDisposableHook<[n: number]>({
    client: (el, args, prev) => log.push(['client', name(el), args, prev]),
    dispose: (el, args) => log.push(['dispose', name(el), args, el.isConnected]),
  });
}

// Module-level, so each rows that use the hook stay pure (view/03 "Rows must be pure").
const log: Call[] = [];
const h = logged(log);

afterEach(() => {
  document.body.replaceChildren();
  log.length = 0;
});

describe('dispose: removal paths', () => {
  it('runs when the part is cleared, after the commit, with the last args', () => {
    const el = mount();
    const view = (on: boolean, n: number) =>
      html`<div>${on ? html`<i id="a" ${h(n)}></i>` : nothing}</div>`;
    render(view(true, 1), el);
    render(view(true, 2), el); // an argument change is not a removal
    render(view(false, 2), el);
    expect(log).toEqual([
      ['client', 'a', [1], undefined],
      ['client', 'a', [2], [1]],
      ['dispose', 'a', [2], false],
    ]);
    expect(el.querySelector('#a')).toBeNull();
  });

  it('runs when the instance is replaced by another template or by text', () => {
    const el = mount();
    render(html`<p>${html`<i id="a" ${h(1)}></i>`}</p>`, el);
    render(html`<p>${html`<b id="b" ${h(2)}></b>`}</p>`, el);
    render(html`<p>${'text'}</p>`, el);
    expect(log.filter((c) => c[0] === 'dispose')).toEqual([
      ['dispose', 'a', [1], false],
      ['dispose', 'b', [2], false],
    ]);
  });

  it('runs for removed each rows, not for moved ones, including nested templates', () => {
    const el = mount();
    const row = (n: number) => html`<li id=${`r${String(n)}`}>${html`<b ${h(n)}>${n}</b>`}</li>`;
    const view = (items: number[]) =>
      html`<ul>
        ${each(items, (n) => n, row)}
      </ul>`;
    render(view([1, 2, 3, 4]), el);
    log.length = 0;
    render(view([4, 3, 2, 1]), el); // reorder: moves only
    expect(log).toEqual([]);
    render(view([4, 2]), el);
    expect(log).toEqual([
      ['dispose', 'b', [1], false],
      ['dispose', 'b', [3], false],
    ]);
  });

  it('runs for every row when a list empties, sole content or not', () => {
    const sole = mount();
    const shared = mount();
    const row = (n: number) => html`<li ${h(n)}>${n}</li>`;
    render(
      html`<ul>
        ${each([1, 2], (n) => n, row)}
      </ul>`,
      sole,
    );
    render(
      html`<ul>
        <li>first</li>
        ${each([3, 4], (n) => n, row)}
      </ul>`,
      shared,
    );
    log.length = 0;
    render(
      html`<ul>
        ${each([], (n: number) => n, row)}
      </ul>`,
      sole,
    ); // replaceChildren path
    render(
      html`<ul>
        <li>first</li>
        ${each([], (n: number) => n, row)}
      </ul>`,
      shared,
    );
    expect(log.map((c) => c[2])).toEqual([[1], [2], [3], [4]]);
  });

  it('runs for removed positional array items', () => {
    const el = mount();
    const view = (items: number[]) => html`<p>${items.map((n) => html`<i ${h(n)}></i>`)}</p>`;
    render(view([1, 2, 3]), el);
    log.length = 0;
    render(view([1]), el);
    expect(log).toEqual([
      ['dispose', 'i', [2], false],
      ['dispose', 'i', [3], false],
    ]);
  });

  it('runs when the position stops holding the hook: nothing, or another hook', () => {
    const other = defineHook<[n: number]>({ client: (_el, args) => log.push(['other', '', args]) });
    const el = mount();
    const view = (hook: unknown) => html`<i id="x" ${hook}></i>`;
    render(view(h(1)), el);
    render(view(nothing), el);
    render(view(h(2)), el);
    render(view(other(3)), el);
    expect(log).toEqual([
      ['client', 'x', [1], undefined],
      ['dispose', 'x', [1], true],
      ['client', 'x', [2], undefined],
      ['dispose', 'x', [2], true],
      ['other', '', [3]],
    ]);
  });

  it('tracks hooks that hydration adopted', () => {
    const el = mount();
    el.innerHTML = '<p><i id="h"></i></p>'; // what the server wrote
    hydrate(html`<p>${html`<i id="h" ${h(1)}></i>`}</p>`, el);
    render(html`<p>${nothing}</p>`, el);
    expect(log).toEqual([
      ['client', 'h', [1], undefined],
      ['dispose', 'h', [1], false],
    ]);
  });

  it('leaves hooks without dispose alone', () => {
    const calls: string[] = [];
    const plain = defineHook<[]>({ client: () => calls.push('client') });
    const el = mount();
    render(html`<p>${html`<i ${plain()}></i>`}</p>`, el);
    render(html`<p>${nothing}</p>`, el);
    expect(calls).toEqual(['client']);
  });

  it('is defineDisposableHook only: defineHook rejects a dispose in development', () => {
    const spec = { client: () => undefined, dispose: () => undefined };
    // @ts-expect-error -- defineHook's spec has no dispose (gyral-c5d.2)
    expect(() => defineHook(spec)).toThrow(/defineDisposableHook/);
  });
});

describe('dispose: host disconnect and reconnect', () => {
  const plainCalls: unknown[] = [];
  const plain = defineHook<[n: number]>({ client: (_el, args, prev) => plainCalls.push(prev) });
  interface State {
    readonly n: number;
    readonly rows: readonly number[];
  }
  type Msg = { readonly _tag: 'Bump' };
  const row = (n: number) => html`<li id=${`row${String(n)}`} ${h(n)}>${n}</li>`;
  const Widget = define<State, Msg>('test-hook-dispose', {
    init: () => ({ n: 1, rows: [10, 20] }),
    intent: {},
    update: { Bump: (s) => ({ ...s, n: s.n + 1 }) },
    view: (s) => html`
      <canvas id="stage" ${h(s.n)} ${plain(0)}></canvas>
      <ul>
        ${each(s.rows, (r) => r, row)}
      </ul>
    `,
  });

  afterEach(() => {
    plainCalls.length = 0;
  });

  it('disposes on disconnect and runs client again, prev undefined, after reconnecting', async () => {
    const el = new Widget();
    document.body.append(el);
    await settled();
    log.length = 0;
    el.remove();
    expect(log).toEqual([
      ['dispose', 'stage', [1], false],
      ['dispose', 'row10', [10], false],
      ['dispose', 'row20', [20], false],
    ]);
    log.length = 0;
    el.send({ _tag: 'Bump' }); // changes while disconnected render on reconnect
    document.body.append(el);
    await settled();
    // The canvas hook re-committed with new args; the skipped rows were revived as they were.
    expect(log).toEqual([
      ['client', 'stage', [2], undefined],
      ['client', 'row10', [10], undefined],
      ['client', 'row20', [20], undefined],
    ]);
    expect(plainCalls).toEqual([undefined]); // no dispose: untouched by the disconnect
  });

  it('revives with the same args when nothing changed while disconnected', async () => {
    const el = new Widget();
    document.body.append(el);
    await settled();
    el.remove();
    log.length = 0;
    document.body.append(el);
    await settled();
    expect(log).toEqual([
      ['client', 'stage', [1], undefined],
      ['client', 'row10', [10], undefined],
      ['client', 'row20', [20], undefined],
    ]);
    el.send({ _tag: 'Bump' });
    await settled();
    expect(log.at(-1)).toEqual(['client', 'stage', [2], [1]]); // and continues as usual
  });

  it.runIf('moveBefore' in Element.prototype)('does nothing on a moveBefore() move', async () => {
    const el = new Widget();
    const a = document.createElement('section');
    const b = document.createElement('section');
    document.body.append(a, b);
    a.append(el);
    await settled();
    log.length = 0;
    (b as unknown as { moveBefore(node: Node, ref: Node | null): void }).moveBefore(el, null);
    await settled();
    expect(el.parentNode).toBe(b);
    expect(log).toEqual([]);
  });
});

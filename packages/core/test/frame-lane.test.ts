// The scheduler's frame lane (docs/design-docs/view/04-scheduler.md "Frame lane"): messages a
// spec lists in `renderOnFrame` render in the next animation frame, once for all of them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineStore, define, html, send, settled } from '../src/index.js';

type Msg = { readonly _tag: 'Tick' } | { readonly _tag: 'Bump' };

const renders: number[] = [];

const Ticker = define<{ readonly ticks: number; readonly bumps: number }, Msg>()(
  'test-frame-ticker',
  {
    init: () => ({ ticks: 0, bumps: 0 }),
    intent: {},
    update: {
      Tick: (s) => ({ ...s, ticks: s.ticks + 1 }),
      Bump: (s) => ({ ...s, bumps: s.bumps + 1 }),
    },
    renderOnFrame: ['Tick'],
    view: (s) => {
      renders.push(s.ticks);
      return html`<output>${s.ticks}/${s.bumps}</output>`;
    },
  },
);

const microtasks = async (): Promise<void> => {
  for (let k = 0; k < 8; k++) await Promise.resolve();
};
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
const text = (el: Element): string | undefined =>
  el.shadowRoot?.querySelector('output')?.textContent ?? undefined;

async function mount() {
  const el = new Ticker();
  document.body.append(el);
  await settled();
  renders.length = 0;
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  renders.length = 0;
});

describe('renderOnFrame', () => {
  it('runs reducers at once and renders every message of a frame once, in that frame', async () => {
    const el = await mount();
    for (let k = 0; k < 5; k++) el.send({ _tag: 'Tick' });
    expect(el.state.ticks).toBe(5);
    await microtasks();
    expect(renders).toEqual([]); // not in the microtask flush
    await nextFrame(); // the scheduler's frame callback was requested first, so it ran first
    expect(renders).toEqual([5]);
    expect(text(el)).toBe('5/0');
  });

  it('renders frame work early when a microtask message arrives, and only once', async () => {
    const el = await mount();
    el.send({ _tag: 'Tick' });
    el.send({ _tag: 'Bump' }); // the microtask lane takes the pending frame work with it
    await microtasks();
    expect(renders).toEqual([1]);
    expect(text(el)).toBe('1/1');
    await nextFrame();
    expect(renders).toEqual([1]);
  });

  it('keeps a microtask-dirty host in the microtask flush', async () => {
    const el = await mount();
    el.send({ _tag: 'Bump' });
    el.send({ _tag: 'Tick' }); // already dirty: renders with the Bump
    await microtasks();
    expect(renders).toEqual([1]);
  });

  it('is waited for by settled()', async () => {
    const el = await mount();
    el.send({ _tag: 'Tick' });
    await settled();
    expect(text(el)).toBe('1/0');
  });

  it('renders from a timer when no animation frame comes (hidden pages)', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const el = await mount();
    el.send({ _tag: 'Tick' });
    const started = performance.now();
    await settled();
    expect(text(el)).toBe('1/0');
    expect(performance.now() - started).toBeGreaterThanOrEqual(90);
  });

  it("covers store changes with 'StoreChanged'", async () => {
    type CounterMsg = { readonly _tag: 'Add' };
    const counter = defineStore<{ readonly n: number }, CounterMsg>('test-frame-counter', {
      init: () => ({ n: 0 }),
      update: { Add: (s) => ({ n: s.n + 1 }) },
    });
    const seen: number[] = [];
    // A reader whose store-driven renders wait for the frame, and a writer elsewhere.
    const Reader = define<Record<string, never>, never>()('test-frame-reader', {
      stores: [counter],
      intent: {},
      update: {},
      renderOnFrame: ['StoreChanged'],
      view: (_s, _i, { read }) => {
        seen.push(read(counter).n);
        return html`<output>${read(counter).n}</output>`;
      },
    });
    const Writer = define<Record<string, never>, CounterMsg>()('test-frame-writer', {
      stores: [counter],
      intent: {},
      update: { Add: (s) => [s, [send(counter, { _tag: 'Add' })]] },
      view: () => html`<i></i>`,
    });
    const reader = new Reader();
    const writer = new Writer();
    document.body.append(reader, writer);
    await settled();
    seen.length = 0;
    for (let k = 0; k < 3; k++) writer.send({ _tag: 'Add' });
    await microtasks();
    expect(seen).toEqual([]);
    await nextFrame();
    expect(seen).toEqual([3]);
    expect(text(reader)).toBe('3');
  });
});

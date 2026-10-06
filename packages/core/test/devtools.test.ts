import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  defineStore,
  DEVTOOLS_GLOBAL,
  devtoolsEnabled,
  html,
  send,
  settled,
  type DevEvent,
} from '../src/index.js';
import { resetDocumentStores } from '../src/store-scope.js';

let events: DevEvent[] = [];
const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  events = [];
  g[DEVTOOLS_GLOBAL] = { emit: (e: DevEvent) => events.push(e) };
});

afterEach(() => {
  Reflect.deleteProperty(g, DEVTOOLS_GLOBAL);
  document.body.replaceChildren();
  resetDocumentStores();
});

// A driver whose calls finish only when the test says so.
const pending: ((v: string) => void)[] = [];
const slow = defineDriver<string, string>({
  name: 'slow',
  run: (input, { signal }) =>
    new Promise<string>((resolve, reject) => {
      pending.push(resolve);
      signal.addEventListener('abort', () => {
        reject(new Error(`aborted ${input}`));
      });
    }),
});

const counter = defineStore<{ readonly n: number }, { readonly _tag: 'Inc' }>('dev-counter', {
  init: () => ({ n: 0 }),
  update: { Inc: (s) => ({ n: s.n + 1 }) },
});

type Msg =
  | { readonly _tag: 'Go'; readonly q: string }
  | { readonly _tag: 'Once' }
  | { readonly _tag: 'Got'; readonly v: string }
  | { readonly _tag: 'Bump' };

const Probe = define<{ readonly got: readonly string[] }, Msg>('test-devtools-probe', {
  init: () => ({ got: [] }),
  stores: [counter],
  intent: { Bump: () => ({ _tag: 'Bump' }) },
  update: {
    Go: (s, m) => [
      s,
      [command(slow, m.q, { onSuccess: (v) => ({ _tag: 'Got', v }), concurrency: 'switch' })],
    ],
    Once: (s) => [
      s,
      [
        command(slow, 'once', {
          onSuccess: (v) => ({ _tag: 'Got', v }),
          key: 'once',
          concurrency: 'exhaust',
        }),
      ],
    ],
    Got: (s, m) => ({ got: [...s.got, m.v] }),
    Bump: (s) => [s, [send(counter, { _tag: 'Inc' })]],
  },
  view: (s, i) =>
    html`<button data-intent=${i.Bump}>bump</button>
      <p>${s.got.join(',')}</p>`,
});

const settle = () => new Promise((r) => setTimeout(r, 0));
const kinds = () => events.map((e) => (e.kind === 'command' ? `command:${e.phase}` : e.kind));

async function mount() {
  const el = new Probe();
  document.body.append(el);
  await settled();
  await settle();
  return el;
}

describe('devtools hook (ADR 0017)', () => {
  it('is enabled in development builds', () => {
    expect(devtoolsEnabled).toBe(true);
  });

  it('reports connect, first render and updates with prev/next state', async () => {
    const el = await mount();
    el.shadowRoot?.querySelector('button')?.click();
    await settle();
    expect(kinds().slice(0, 2)).toEqual(['connect', 'hydrated']);
    const update = events.find((e) => e.kind === 'update');
    expect(update).toMatchObject({
      kind: 'update',
      component: { tag: 'test-devtools-probe', element: el },
      msg: { _tag: 'Bump' },
    });
    expect(events.find((e) => e.kind === 'hydrated')).toMatchObject({ serverRendered: false });
  });

  it('reports store messages with prev and next', async () => {
    const el = await mount();
    el.shadowRoot?.querySelector('button')?.click();
    await settle();
    expect(events.find((e) => e.kind === 'store')).toMatchObject({
      store: 'dev-counter',
      msg: { _tag: 'Inc' },
      prev: { n: 0 },
      next: { n: 1 },
    });
  });

  it('traces commands: issued, interrupted by switch, settled, dropped by exhaust', async () => {
    const el = await mount();
    el.send({ _tag: 'Go', q: 'a' });
    el.send({ _tag: 'Go', q: 'b' });
    await settle();
    pending.at(-1)?.('B');
    el.send({ _tag: 'Once' });
    el.send({ _tag: 'Once' });
    await settle();
    await settle();
    const commands = events.filter((e) => e.kind === 'command');
    expect(commands.map((c) => `${c.phase}:${String(c.input)}`)).toEqual(
      expect.arrayContaining([
        'issued:a',
        'issued:b',
        'interrupted:a',
        'settled:b',
        'issued:once',
        'dropped:once',
      ]),
    );
    expect(commands[0]).toMatchObject({ driver: 'slow', lane: 'slow', policy: 'switch' });
    expect(commands[0]?.kind === 'command' ? commands[0].owner : '').toMatch(
      /^<test-devtools-probe>#\d+$/,
    );
    expect(el.state.got).toEqual(['B']);
  });

  it('reports disconnects', async () => {
    const el = await mount();
    el.remove();
    expect(kinds().at(-1)).toBe('disconnect');
  });

  it('costs nothing and throws nothing without a listener', async () => {
    Reflect.deleteProperty(g, DEVTOOLS_GLOBAL);
    const el = await mount();
    el.shadowRoot?.querySelector('button')?.click();
    expect(events).toEqual([]);
  });
});

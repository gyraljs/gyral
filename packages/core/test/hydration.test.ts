import { afterEach, describe, expect, it } from 'vitest';
import { command, define, defineDriver, html } from '../src/index.js';
import { SEED_ATTRIBUTE } from '../src/hydration.js';

let calls: string[] = [];
const sync = defineDriver<string, string>({
  name: 'sync',
  run: (input) => {
    calls.push(input);
    return input; // answers immediately, like the router's first location
  },
});

interface Props {
  readonly label?: string;
  readonly items?: readonly string[];
}
interface State {
  readonly title: string;
  readonly heard: readonly string[];
  readonly renders: number;
}
type Msg = { readonly _tag: 'Heard'; readonly value: string };

let firstRenderState: State | undefined;

const Seeded = define<State, Msg, Props>('test-seeded', {
  props: { label: { type: String }, items: { attribute: false } },
  init: (p) => [
    { title: `init:${p.label ?? ''}`, heard: [], renders: 0 },
    [command(sync, p.label ?? '', { onSuccess: (value) => ({ _tag: 'Heard', value }) })],
  ],
  intent: {},
  update: { Heard: (s, m) => ({ ...s, heard: [...s.heard, m.value] }) },
  view: (s, _i, { props }) => {
    firstRenderState ??= s;
    return html`<h2>${s.title}</h2>
      <p>${(props.items ?? []).join(',')}</p>`;
  },
});

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
  calls = [];
  firstRenderState = undefined;
});

describe('resuming from a server seed (ADR 0012)', () => {
  it('uses the seeded state and props instead of init, then removes the seed', async () => {
    const el = new Seeded();
    el.setAttribute('label', 'server');
    el.setAttribute(
      SEED_ATTRIBUTE,
      JSON.stringify({
        state: { title: 'from server', heard: [], renders: 0 },
        props: { items: ['a', 'b'] },
      }),
    );
    document.body.append(el);
    await el.updateComplete;
    expect(firstRenderState?.title).toBe('from server');
    expect(el.items).toEqual(['a', 'b']);
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('a,b');
    expect(el.hasAttribute(SEED_ATTRIBUTE)).toBe(false);
  });

  it("starts init's commands only after the first render", async () => {
    const el = new Seeded();
    el.setAttribute('label', 'x');
    el.setAttribute(
      SEED_ATTRIBUTE,
      JSON.stringify({ state: { title: 't', heard: [], renders: 0 }, props: {} }),
    );
    document.body.append(el);
    await el.updateComplete;
    expect(firstRenderState?.heard).toEqual([]);
    await settle();
    await el.updateComplete;
    expect(calls).toEqual(['x']);
    expect(el.state.heard).toEqual(['x']);
  });

  it('falls back to init when there is no seed (client-only render)', async () => {
    const el = new Seeded();
    el.setAttribute('label', 'csr');
    document.body.append(el);
    await el.updateComplete;
    expect(el.state.title).toBe('init:csr');
  });

  it('ignores an unreadable seed and renders from init', async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const el = new Seeded();
      el.setAttribute(SEED_ATTRIBUTE, '{not json');
      document.body.append(el);
      await el.updateComplete;
      expect(el.state.title).toBe('init:');
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});

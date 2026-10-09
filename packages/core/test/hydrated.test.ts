import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled, type Hydrated } from '../src/index.js';
import { SEED_ATTRIBUTE } from '../src/hydration.js';

interface State {
  readonly enhanced: boolean;
  readonly heard: readonly Hydrated[];
}
type Msg = { readonly _tag: 'Noop' };

const renders: boolean[] = [];

// Progressive enhancement: a plain list first (server and first client render), then the
// enhanced UI once the component is live.
const Enhance = define<State, Msg>()('test-enhance', {
  init: () => ({ enhanced: false, heard: [] }),
  intent: {},
  update: {
    Noop: (s) => s,
    Hydrated: (s, m) => ({ enhanced: true, heard: [...s.heard, m] }),
  },
  view: (s) => {
    renders.push(s.enhanced);
    return s.enhanced ? html`<p class="enhanced">enhanced</p>` : html`<ul class="plain"></ul>`;
  },
});

const Plain = define<{ readonly n: number }, Msg>()('test-no-hydrated', {
  init: () => ({ n: 0 }),
  intent: {},
  update: { Noop: (s) => s },
  view: () => html`<p>plain</p>`,
});

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
  renders.length = 0;
});

describe('Hydrated framework message', () => {
  it('arrives once after the first client render, with serverRendered: false', async () => {
    const el = new Enhance();
    document.body.append(el);
    await settled();
    expect(renders[0]).toBe(false); // the first render is the no-JS UI
    await settled();
    expect(el.state.heard).toEqual([{ _tag: 'Hydrated', serverRendered: false }]);
    expect(el.shadowRoot?.querySelector('.enhanced')).not.toBeNull();
    el.remove();
    document.body.append(el); // reconnecting does not repeat it
    await settle();
    expect(el.state.heard).toHaveLength(1);
  });

  it('reports serverRendered: true when resuming from a seed', async () => {
    const el = new Enhance();
    el.setAttribute(
      SEED_ATTRIBUTE,
      JSON.stringify({ state: { enhanced: false, heard: [] }, props: {} }),
    );
    document.body.append(el);
    await settled();
    expect(renders[0]).toBe(false); // matches the server markup
    await settle();
    expect(el.state.heard).toEqual([{ _tag: 'Hydrated', serverRendered: true }]);
  });

  it('is optional: components without the reducer get no warning', async () => {
    const warn = console.warn;
    const warned: unknown[] = [];
    console.warn = (...args: unknown[]) => warned.push(args);
    try {
      const el = new Plain();
      document.body.append(el);
      await settled();
      await settle();
    } finally {
      console.warn = warn;
    }
    expect(warned).toEqual([]);
  });
});

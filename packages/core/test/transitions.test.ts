import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { define, html, settled } from '../src/index.js';

type Msg = { readonly _tag: 'Go'; readonly page: string } | { readonly _tag: 'Tick' };

const Pages = define<{ readonly page: string; readonly ticks: number }, Msg>('test-transitions', {
  init: () => ({ page: 'home', ticks: 0 }),
  intent: {},
  update: {
    Go: (s, m) => ({ ...s, page: m.page }),
    Tick: (s) => ({ ...s, ticks: s.ticks + 1 }),
  },
  viewTransition: (prev, next) => prev.page !== next.page,
  view: (s) =>
    html`<h1>${s.page}</h1>
      <p>${s.ticks}</p>`,
});

let calls: string[] = [];

function stubTransitions(reducedMotion: boolean): void {
  // Records what the DOM showed when the transition's update callback ran.
  vi.spyOn(document, 'startViewTransition').mockImplementation(
    (update?: ViewTransitionUpdateCallback | StartViewTransitionOptions) => {
      calls.push('start');
      const done = typeof update === 'function' ? Promise.resolve(update()) : Promise.resolve();
      return {
        ready: Promise.resolve(),
        finished: done.then(() => undefined),
        updateCallbackDone: done.then(() => undefined),
        skipTransition: () => undefined,
        types: new Set<string>(),
      };
    },
  );
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: reducedMotion && query.includes('reduce') }) as MediaQueryList,
  );
}

async function mount() {
  const el = new Pages();
  document.body.append(el);
  await settled();
  return el;
}

const heading = (el: Element) => el.shadowRoot?.querySelector('h1')?.textContent;

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('viewTransition hook', () => {
  it('renders changes the hook accepts inside a view transition', async () => {
    stubTransitions(false);
    const el = await mount();
    el.send({ _tag: 'Go', page: 'about' });
    expect(calls).toEqual([]); // the flush (and so the transition) starts in a microtask
    await settled(); // waits for the transition's update callback
    expect(calls).toEqual(['start']);
    expect(heading(el)).toBe('about');
  });

  it('renders other changes directly', async () => {
    stubTransitions(false);
    const el = await mount();
    el.send({ _tag: 'Tick' });
    await settled();
    expect(calls).toEqual([]);
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('1');
  });

  it('skips transitions when reduced motion is requested', async () => {
    stubTransitions(true);
    const el = await mount();
    el.send({ _tag: 'Go', page: 'about' });
    await settled();
    expect(calls).toEqual([]);
    expect(heading(el)).toBe('about');
  });

  it('works with the real API when two transitions overlap', async () => {
    const el = await mount();
    el.send({ _tag: 'Go', page: 'a' });
    el.send({ _tag: 'Go', page: 'b' }); // skips the first transition; its update still runs
    await settled();
    expect(heading(el)).toBe('b');
  });
});

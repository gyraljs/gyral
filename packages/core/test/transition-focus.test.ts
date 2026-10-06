// gyral-6zz: focus() returned by a reducer whose update runs inside a View Transition must
// run after the transition's DOM update, not before it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, focus, html, settled } from '../src/index.js';

type Msg = { readonly _tag: 'Open'; readonly id: string };

const Cards = define<{ readonly open: string | null }, Msg>('test-transition-focus', {
  init: () => ({ open: null }),
  intent: {},
  update: {
    Open: (s, m) => [{ ...s, open: m.id }, [focus('#detail')]],
  },
  viewTransition: (prev, next) => prev.open !== next.open,
  view: (s) =>
    s.open === null ? html`<p>list</p>` : html`<h2 id="detail" tabindex="-1">${s.open}</h2>`,
});

// Like real browsers, the update callback runs in a later task, not synchronously.
function stubAsyncTransitions(): void {
  vi.spyOn(document, 'startViewTransition').mockImplementation(
    (update?: ViewTransitionUpdateCallback | StartViewTransitionOptions) => {
      const done = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const run: unknown = typeof update === 'function' ? update() : undefined;
          Promise.resolve(run).then(() => {
            resolve();
          }, reject);
        }, 10);
      });
      return {
        ready: done,
        finished: done,
        updateCallbackDone: done,
        skipTransition: () => undefined,
        types: new Set<string>(),
      };
    },
  );
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: false }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('focus() inside a view transition update', () => {
  it('focuses the element the new view renders', async () => {
    stubAsyncTransitions();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = new Cards();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Open', id: 'swatch-3' });
    await settled(); // waits for the transition's update and the focus command after it
    expect(warn).not.toHaveBeenCalled();
    expect(el.shadowRoot?.activeElement?.id).toBe('detail');
  });
});

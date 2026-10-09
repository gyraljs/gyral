// focus(selector, { wait: true }) (gyral-1zd.15): when the target appears only in a later
// render (results arriving after a search, say), the request waits for it; a newer focus()
// replaces it; after one second it gives up with the usual warning.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, focus, html, settled } from '../src/index.js';

interface State {
  readonly step: number;
}
type Msg =
  | { readonly _tag: 'Search' }
  | { readonly _tag: 'Arrive' }
  | { readonly _tag: 'Other' }
  | { readonly _tag: 'Plain' };

const Results = define<State, Msg>()('test-focus-wait', {
  init: () => ({ step: 0 }),
  intent: {},
  update: {
    Search: (s) => [{ ...s, step: 1 }, [focus('#first', { wait: true })]],
    Arrive: (s) => ({ ...s, step: s.step + 1 }),
    Other: (s) => [s, [focus('#search')]],
    Plain: (s) => [s, [focus('#first')]],
  },
  view: (s) => html`
    <input id="search" />
    <p>step ${String(s.step)}</p>
    ${s.step >= 3 ? html`<a id="first" href="#r1">First result</a>` : null}
  `,
});

type ResultsElement = HTMLElement & { send(msg: Msg): void };

async function mount(): Promise<ResultsElement> {
  const el = new Results() as ResultsElement;
  document.body.append(el);
  await settled();
  return el;
}

const active = (el: HTMLElement): Element | null | undefined => el.shadowRoot?.activeElement;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('focus(selector, { wait: true })', () => {
  it('focuses a target that appears two renders later', async () => {
    const el = await mount();
    el.send({ _tag: 'Search' });
    await settled();
    expect(active(el)).toBeNull();
    el.send({ _tag: 'Arrive' });
    await settled();
    expect(active(el)).toBeNull();
    el.send({ _tag: 'Arrive' });
    await settled();
    await vi.waitFor(() => {
      expect(active(el)?.id).toBe('first');
    });
  });

  it('is replaced by a newer focus() from the same component', async () => {
    const el = await mount();
    el.send({ _tag: 'Search' });
    await settled();
    el.send({ _tag: 'Other' });
    await settled();
    expect(active(el)?.id).toBe('search');
    el.send({ _tag: 'Arrive' });
    el.send({ _tag: 'Arrive' });
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(active(el)?.id).toBe('search');
  });

  it('gives up after one second with the usual warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await mount();
    vi.useFakeTimers();
    el.send({ _tag: 'Search' });
    await settled();
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('#first');
    vi.useRealTimers();
    el.send({ _tag: 'Arrive' });
    el.send({ _tag: 'Arrive' });
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(active(el)).toBeNull();
  });

  it('without wait, a missing target warns at once, as before', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await mount();
    el.send({ _tag: 'Plain' });
    await settled();
    expect(warn).toHaveBeenCalledTimes(1);
    el.send({ _tag: 'Arrive' });
    el.send({ _tag: 'Arrive' });
    el.send({ _tag: 'Arrive' });
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(active(el)).toBeNull();
  });
});

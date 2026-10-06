import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { listen, makeRouter, type RouteLocation, type RouterDriver } from '../src/index.js';

interface State {
  readonly seen: readonly string[];
}
type Msg = { readonly _tag: 'Routed'; readonly location: RouteLocation };

const Listener = define<State, Msg>('test-capture-app', {
  init: () => [{ seen: [] }, [listen((location) => ({ _tag: 'Routed', location }))]],
  intent: {},
  update: { Routed: (s, m) => ({ seen: [...s.seen, m.location.pathname] }) },
  view: () => html``,
});

const settle = () => new Promise((r) => setTimeout(r, 0));
const drivers: RouterDriver[] = [];

function memoryRouter(options: Parameters<typeof makeRouter>[0] = {}): RouterDriver {
  const driver = makeRouter({ history: 'memory', captureLinks: true, ...options });
  drivers.push(driver);
  return driver;
}

async function mountWith(driver: RouterDriver): Promise<InstanceType<typeof Listener>> {
  const el = new Listener();
  el.drivers = { router: driver };
  document.body.append(el);
  await settled();
  await vi.waitFor(() => {
    expect(el.state.seen.length).toBeGreaterThan(0);
  });
  return el;
}

function link(href: string, parent: Node = document.body): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = href;
  parent.appendChild(a);
  return a;
}

/**
 * Clicks `a` and reports whether a router claimed it (preventDefault). Read on `window`, after
 * the event has bubbled past every router listener (document or subtree), then cancelled so the
 * test page never navigates.
 */
function click(a: HTMLAnchorElement): boolean {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  let claimed = false;
  const after = (e: Event): void => {
    if (e !== event) return;
    claimed = e.defaultPrevented;
    e.preventDefault();
  };
  window.addEventListener('click', after);
  a.dispatchEvent(event);
  window.removeEventListener('click', after);
  return claimed;
}

afterEach(() => {
  document.body.replaceChildren();
  for (const driver of drivers.splice(0)) driver.dispose();
  vi.restoreAllMocks();
});

describe('link capture is tied to listeners (gyral-ud5.10)', () => {
  it('a leftover router whose component disconnected never claims clicks', async () => {
    const old = memoryRouter();
    const oldEl = await mountWith(old);
    oldEl.remove(); // its listen stream aborts; the old router is NOT disposed (the leak)
    await settle();

    const current = memoryRouter();
    const el = await mountWith(current);
    expect(click(link('/users/5'))).toBe(true);
    await vi.waitFor(() => {
      expect(el.state.seen).toEqual(['/', '/users/5']);
    });
    expect(old.snapshot().href).toBe('http://localhost/'); // the old router stayed put
  });

  it('a router nobody listens to does not capture', () => {
    memoryRouter();
    expect(click(link('/somewhere'))).toBe(false);
  });

  it('stops capturing when the last listener ends, and resumes with a new one', async () => {
    const driver = memoryRouter();
    const first = await mountWith(driver);
    first.remove();
    await settle();
    expect(click(link('/a'))).toBe(false);
    await mountWith(driver);
    expect(click(link('/b'))).toBe(true);
  });

  it('warns when two routers capture on the same root at once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mountWith(memoryRouter());
    expect(warn).not.toHaveBeenCalled();
    await mountWith(memoryRouter());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('two routers are capturing'));
  });

  it('linkRoot limits capture to a subtree', async () => {
    const area = document.createElement('section');
    document.body.append(area);
    const el = await mountWith(memoryRouter({ linkRoot: area }));
    expect(click(link('/outside'))).toBe(false);
    expect(click(link('/inside', area))).toBe(true);
    await vi.waitFor(() => {
      expect(el.state.seen).toEqual(['/', '/inside']);
    });
  });
});

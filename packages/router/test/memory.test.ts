import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { define, html } from '@gyral/core';
import {
  back,
  forward,
  listen,
  makeRouter,
  navigate,
  routes,
  setTitle,
  type RouteLocation,
  type RouteMatch,
  type RouterDriver,
} from '../src/index.js';

const app = routes({ home: '/', user: '/users/:id' });
const titleOf = (route: RouteMatch<typeof app.table> | undefined): string =>
  route === undefined ? 'Not found' : route.name === 'user' ? `User ${route.params.id}` : 'Home';

interface State {
  readonly route: RouteMatch<typeof app.table> | undefined;
  readonly seen: readonly string[];
}
type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Go'; readonly url: string; readonly replace?: boolean }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'Forward' };

const App = define<State, Msg>('test-memory-app', {
  init: () => [
    { route: undefined, seen: [] },
    [listen((location) => ({ _tag: 'Routed', location }))],
  ],
  intent: {},
  update: {
    Routed: (s, m) => {
      const route = app.match(m.location.href);
      return [{ route, seen: [...s.seen, m.location.pathname] }, [setTitle(titleOf(route))]];
    },
    Go: (s, m) => [s, [navigate(m.url, { replace: m.replace ?? false })]],
    Back: (s) => [s, [back()]],
    Forward: (s) => [s, [forward()]],
  },
  view: () => html`<a id="in" href="/users/9">in-app</a>`,
});

describe('memory history', () => {
  const original = location.href;
  const originalTitle = document.title;
  let driver: RouterDriver;
  let el: InstanceType<typeof App>;

  beforeEach(async () => {
    driver = makeRouter({ history: 'memory', initial: '/users/1' });
    el = new App();
    el.drivers = { router: driver };
    document.body.append(el);
    await el.updateComplete;
    await vi.waitFor(() => {
      expect(el.state.seen).toEqual(['/users/1']);
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    driver.dispose();
  });

  it('starts at the initial URL without touching the real location', () => {
    expect(el.state.route).toEqual({ name: 'user', params: { id: '1' } });
    expect(location.href).toBe(original);
    expect(driver.snapshot().href).toBe('http://localhost/users/1');
  });

  it('pushes, replaces and traverses entries', async () => {
    el.send({ _tag: 'Go', url: '/users/2' });
    el.send({ _tag: 'Go', url: '/users/3' });
    el.send({ _tag: 'Go', url: '/users/4', replace: true });
    await vi.waitFor(() => {
      expect(el.state.route?.params).toEqual({ id: '4' });
    });
    expect(driver.snapshot().length).toBe(3);
    el.send({ _tag: 'Back' });
    await vi.waitFor(() => {
      expect(el.state.route?.params).toEqual({ id: '2' });
    });
    el.send({ _tag: 'Forward' });
    await vi.waitFor(() => {
      expect(el.state.route?.params).toEqual({ id: '4' });
    });
    expect(location.href).toBe(original);
  });

  it('clamps traversal at either end', async () => {
    el.send({ _tag: 'Back' });
    await new Promise((r) => setTimeout(r, 10));
    expect(el.state.seen).toEqual(['/users/1']);
  });

  it('captures in-app link clicks into memory', async () => {
    el.shadowRoot?.querySelector<HTMLAnchorElement>('#in')?.click();
    await vi.waitFor(() => {
      expect(el.state.route?.params).toEqual({ id: '9' });
    });
    expect(location.href).toBe(original);
  });

  it('records titles set by setTitle() without changing document.title', async () => {
    await vi.waitFor(() => {
      expect(driver.snapshot().title).toBe('User 1');
    });
    el.send({ _tag: 'Go', url: '/' });
    await vi.waitFor(() => {
      expect(driver.snapshot().title).toBe('Home');
    });
    expect(document.title).toBe(originalTitle);
  });

  it('ignores navigation to another origin', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    el.send({ _tag: 'Go', url: 'https://example.com/users/5' });
    await new Promise((r) => setTimeout(r, 10));
    expect(el.state.seen).toEqual(['/users/1']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('memory history without a document', () => {
  it('routes with linkRoot: null (server-style use)', async () => {
    const driver = makeRouter({ history: 'memory', initial: '/users/7', linkRoot: null });
    const seen: string[] = [];
    const controller = new AbortController();
    const listening = driver.run(
      { _tag: 'Listen' },
      {
        signal: controller.signal,
        emit: (location) => {
          if (location !== undefined) seen.push(location.pathname);
        },
      },
    );
    await driver.run(
      { _tag: 'Navigate', url: '/users/8', replace: false },
      {
        signal: controller.signal,
        emit: () => undefined,
      },
    );
    expect(seen).toEqual(['/users/7', '/users/8']);
    controller.abort();
    await expect(listening).rejects.toThrow();
    driver.dispose();
  });
});

describe('setTitle() with the browser history', () => {
  it('sets document.title', async () => {
    const before = document.title;
    const driver = makeRouter({ captureLinks: false, navigationApi: false });
    await driver.run(
      { _tag: 'Title', title: 'Hello' },
      {
        signal: new AbortController().signal,
        emit: () => undefined,
      },
    );
    expect(document.title).toBe('Hello');
    expect(driver.snapshot().title).toBe('Hello');
    document.title = before;
    driver.dispose();
  });
});

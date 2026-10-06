import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { define, html, settled } from '@gyral/core';
import {
  back,
  listen,
  makeRouter,
  navigate,
  routes,
  type RouteLocation,
  type RouteMatch,
  type RouterDriver,
} from '../src/index.js';

const app = routes({ home: '/', user: '/users/:id' });

interface State {
  readonly route: RouteMatch<typeof app.table> | undefined;
  readonly seen: readonly string[];
}
type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Go'; readonly url: string; readonly replace?: boolean }
  | { readonly _tag: 'Back' };

const toRouted = (location: RouteLocation): Msg => ({ _tag: 'Routed', location });

const App = define<State, Msg>('test-router-app', {
  init: () => [{ route: undefined, seen: [] }, [listen(toRouted)]],
  intent: {},
  update: {
    Routed: (s, m) => ({
      route: app.match(m.location.href),
      seen: [...s.seen, m.location.pathname],
    }),
    Go: (s, m) => [s, [navigate(m.url, { replace: m.replace ?? false })]],
    Back: (s) => [s, [back()]],
  },
  view: () => html`
    <nav>
      <a id="in" href="/users/9">in-app</a>
      <a id="blank" href="/users/1" target="_blank">new tab</a>
      <a id="download" href="/users/2" download>download</a>
      <a id="external" href="/users/3" rel="external">external</a>
      <a id="other" href="https://example.com/users/4">other origin</a>
      <a id="hash" href="#section">hash</a>
    </nav>
  `,
});

const original = location.href;
let captured: boolean[] = [];
// Runs after the router's document listener: records its decision, then stops real navigation.
const guard = (event: MouseEvent): void => {
  captured.push(event.defaultPrevented);
  event.preventDefault();
};

const modes: [string, boolean][] = [
  ['History API only (Navigation API forced off)', false],
  ['Navigation API', true],
];

describe.each(modes)('router: %s', (_label, navigationApi) => {
  let driver: RouterDriver;
  let el: InstanceType<typeof App>;

  const link = (id: string): HTMLAnchorElement => {
    const a = el.shadowRoot?.querySelector<HTMLAnchorElement>(`#${id}`);
    if (a == null) throw new Error(`no #${id}`);
    return a;
  };
  const routeOf = () => el.state.route;

  beforeEach(async () => {
    if (navigationApi) expect('navigation' in window).toBe(true);
    captured = [];
    window.addEventListener('click', guard);
    driver = makeRouter({ navigationApi, captureLinks: true });
    el = new App();
    el.drivers = { router: driver };
    document.body.append(el);
    await settled();
    await vi.waitFor(() => {
      expect(el.state.seen).toHaveLength(1); // the initial location is delivered at once
    });
  });

  afterEach(() => {
    window.removeEventListener('click', guard);
    document.body.replaceChildren();
    driver.dispose();
    history.replaceState(null, '', original);
  });

  it('navigates by command and delivers the new route', async () => {
    el.send({ _tag: 'Go', url: '/users/7' });
    await vi.waitFor(() => {
      expect(routeOf()).toEqual({ name: 'user', params: { id: '7' } });
    });
    expect(location.pathname).toBe('/users/7');
  });

  it('replaces without adding a history entry', async () => {
    const length = history.length;
    el.send({ _tag: 'Go', url: '/users/5', replace: true });
    await vi.waitFor(() => {
      expect(routeOf()?.params).toEqual({ id: '5' });
    });
    expect(history.length).toBe(length);
  });

  it('goes back (popstate / traversal) and delivers the earlier route', async () => {
    el.send({ _tag: 'Go', url: '/users/7' });
    await vi.waitFor(() => {
      expect(location.pathname).toBe('/users/7');
    });
    el.send({ _tag: 'Go', url: '/users/8' });
    await vi.waitFor(() => {
      expect(routeOf()?.params).toEqual({ id: '8' });
    });
    el.send({ _tag: 'Back' });
    await vi.waitFor(() => {
      expect(routeOf()?.params).toEqual({ id: '7' });
    });
  });

  it('captures same-origin link clicks inside shadow roots', async () => {
    link('in').click();
    await vi.waitFor(() => {
      expect(routeOf()).toEqual({ name: 'user', params: { id: '9' } });
    });
    expect(captured).toEqual([true]);
  });

  it.each(['blank', 'download', 'external', 'other', 'hash'])('leaves #%s to the browser', (id) => {
    link(id).click();
    expect(captured).toEqual([false]);
    expect(location.pathname).toBe(new URL(original).pathname);
  });

  it('ignores modified clicks', () => {
    link('in').dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ctrlKey: true }),
    );
    expect(captured).toEqual([false]);
  });

  it('stops listening when the component disconnects', async () => {
    el.remove();
    history.pushState(null, '', '/users/99');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.state.seen).toHaveLength(1);
  });
});

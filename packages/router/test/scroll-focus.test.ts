// Scroll and focus after a navigation (ADR 0009 "Scroll and focus", gyral-dyn.4): the same
// behaviour on the History API path and the Navigation API path, both run in Chromium.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { define, focus, html, settled } from '@gyral/core';
import {
  back,
  forward,
  listen,
  makeRouter,
  navigate,
  routes,
  type NavigateOptions,
  type RouteLocation,
  type RouteMatch,
  type RouterDriver,
} from '../src/index.js';

const app = routes({ home: '/', user: '/users/:id', profile: '/profile/:id' });

interface State {
  readonly route: RouteMatch<typeof app.table> | undefined;
}
type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Go'; readonly url: string; readonly options?: NavigateOptions }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'Forward' };

// A light-DOM page (ADR 0014), so `#fragment` targets are in the document. Every page is
// taller than the viewport; `#far` exists only on user pages, so it appears with the render.
const Page = define<State, Msg>('test-scroll-page', {
  shadow: false,
  init: () => [{ route: undefined }, [listen((location) => ({ _tag: 'Routed', location }))]],
  intent: {},
  update: {
    Routed: (_s, m) => {
      const route = app.match(m.location.href);
      // The recommended pattern: focus the new page's heading once it has rendered.
      return [{ route }, route?.name === 'profile' && m.location.seq > 0 ? [focus('h1')] : []];
    },
    Go: (s, m) => [s, [navigate(m.url, m.options)]],
    Back: (s) => [s, [back()]],
    Forward: (s) => [s, [forward()]],
  },
  view: (s) => html`
    <h1 tabindex="-1">${s.route?.name ?? 'none'}</h1>
    <div style="block-size: 3000px"></div>
    ${s.route?.name === 'user' ? html`<h2 id="far">Far</h2>` : ''}
    <div style="block-size: 3000px"></div>
  `,
});

// The History API path loads with import() on first use (ADR 0003 tier 3); load it before the
// tests, so a slow first fetch doesn't count against each test's waits.
beforeAll(async () => {
  await import('../src/internal/history.js');
});

const modes: [string, boolean][] = [
  ['History API only (Navigation API forced off)', false],
  ['Navigation API', true],
];

describe.each(modes)('scroll and focus: %s', (_label, navigationApi) => {
  const original = location.href;
  let driver: RouterDriver;
  let el: InstanceType<typeof Page>;
  let button: HTMLButtonElement;

  // Navigates and waits until the router's post-navigation steps have run (the Navigation API
  // runs them when the intercept handler's promise settles, after the render).
  const go = async (url: string, options?: NavigateOptions): Promise<void> => {
    el.send(options === undefined ? { _tag: 'Go', url } : { _tag: 'Go', url, options });
    await vi.waitFor(() => {
      expect(location.pathname + location.hash).toBe(url);
    });
    await settled();
    await new Promise((r) => setTimeout(r, 50));
  };
  const far = (): HTMLElement => {
    const h2 = document.getElementById('far');
    if (h2 === null) throw new Error('no #far');
    return h2;
  };

  beforeEach(async () => {
    if (navigationApi) expect('navigation' in window).toBe(true);
    history.replaceState(null, '', '/');
    driver = makeRouter({ navigationApi });
    button = document.createElement('button');
    button.textContent = 'outside';
    el = new Page();
    el.drivers = { router: driver };
    document.body.append(button, el);
    await settled();
    await vi.waitFor(() => {
      expect(el.state.route?.name).toBe('home');
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    driver.dispose();
    scrollTo(0, 0);
    history.replaceState(null, '', original);
  });

  it('scrolls to the top after a push', async () => {
    scrollTo(0, 1500);
    await go('/users/7');
    await vi.waitFor(() => {
      expect(scrollY).toBe(0);
    });
  });

  it('scrolls to a #fragment target that only the new page renders', async () => {
    await go('/users/7#far');
    await vi.waitFor(() => {
      expect(Math.abs(far().getBoundingClientRect().top)).toBeLessThan(2);
    });
    expect(scrollY).toBeGreaterThan(2900);
  });

  it('leaves scroll alone with { scroll: false }', async () => {
    scrollTo(0, 1500);
    await go('/users/7', { scroll: false });
    expect(scrollY).toBe(1500);
  });

  it('restores the scroll position on back and forward', async () => {
    await go('/users/1');
    scrollTo(0, 1200);
    await new Promise((r) => requestAnimationFrame(r)); // let the scroll event arrive
    await go('/users/2');
    await vi.waitFor(() => {
      expect(scrollY).toBe(0);
    });
    scrollTo(0, 700);
    await new Promise((r) => requestAnimationFrame(r));
    el.send({ _tag: 'Back' });
    await vi.waitFor(() => {
      expect(el.state.route?.params).toEqual({ id: '1' });
      expect(scrollY).toBe(1200);
    });
    el.send({ _tag: 'Forward' });
    await vi.waitFor(() => {
      expect(el.state.route?.params).toEqual({ id: '2' });
      expect(scrollY).toBe(700);
    });
  });

  it('resets focus to the page start after a navigation', async () => {
    button.focus();
    await go('/users/7');
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(document.body);
    });
  });

  it('keeps focus that the app moved during the navigation (focus("h1"))', async () => {
    button.focus();
    await go('/profile/3');
    expect(document.activeElement).toBe(el.querySelector('h1'));
  });

  it('leaves focus alone with { focusReset: false }', async () => {
    button.focus();
    await go('/users/7', { focusReset: false });
    expect(document.activeElement).toBe(button);
  });

  it('honours router-wide defaults', async () => {
    driver.dispose();
    driver = makeRouter({ navigationApi, scroll: false, focusReset: false });
    el.remove();
    el = new Page();
    el.drivers = { router: driver };
    document.body.append(el);
    await settled();
    button.focus();
    scrollTo(0, 1500);
    await go('/users/7');
    expect(scrollY).toBe(1500);
    expect(document.activeElement).toBe(button);
  });
});

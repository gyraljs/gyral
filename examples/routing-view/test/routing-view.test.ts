import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { step } from '@gyral/testing';
import { makeRouter, type RouterDriver } from '@gyral/router';
import { app, RoutingView } from '../src/app.js';

const original = location.href;
let driver: RouterDriver;

async function mount(path: string) {
  history.replaceState(null, '', path);
  const el = new RoutingView();
  // The History-API-only path is the baseline (ADR 0003), so test that one.
  el.drivers = { router: driver };
  document.body.append(el);
  await el.updateComplete;
  await vi.waitFor(() => {
    expect(el.state.location).toBeDefined();
  });
  await el.updateComplete;
  const $ = (sel: string) => el.shadowRoot?.querySelector(sel);
  const link = (name: string) => {
    const a = [...(el.shadowRoot?.querySelectorAll('nav a') ?? [])].find(
      (x) => x.textContent.trim() === name,
    );
    if (!(a instanceof HTMLAnchorElement)) throw new Error(`no link ${name}`);
    return a;
  };
  return { el, $, link };
}

beforeEach(() => {
  driver = makeRouter({ navigationApi: false });
});

afterEach(() => {
  document.body.replaceChildren();
  driver.dispose();
  history.replaceState(null, '', original);
});

describe('routing-view', () => {
  it('matches the typed route table', () => {
    expect(app.match('https://x.test/about')).toEqual({ name: 'about', params: {} });
    expect(app.match('https://x.test/nope')).toBeUndefined();
  });

  it('derives the route from each Routed message', () => {
    const location = {
      href: 'https://x.test/contacts',
      pathname: '/contacts',
      search: '',
      hash: '',
      seq: 1,
    };
    const { state } = step(
      RoutingView.spec,
      { location: undefined, route: undefined },
      {
        _tag: 'Routed',
        location,
      },
    );
    expect(state.route?.name).toBe('contacts');
  });

  it('renders the initial route and marks its link as current', async () => {
    const { $, link } = await mount('/about');
    expect($('h1')?.textContent).toBe('About me');
    expect(link('About').getAttribute('aria-current')).toBe('page');
    expect(link('Home').hasAttribute('aria-current')).toBe(false);
  });

  it('navigates on link clicks without reloading', async () => {
    const { el, $, link } = await mount('/');
    link('Contacts').click();
    await vi.waitFor(() => {
      expect(el.state.route?.name).toBe('contacts');
    });
    await el.updateComplete;
    expect(location.pathname).toBe('/contacts');
    expect($('h1')?.textContent).toBe('Contact me');
    expect(link('Contacts').getAttribute('aria-current')).toBe('page');
  });

  it('goes back through history', async () => {
    const { el, $, link } = await mount('/');
    link('About').click();
    await vi.waitFor(() => {
      expect(el.state.route?.name).toBe('about');
    });
    const backButton = $('main button');
    if (!(backButton instanceof HTMLButtonElement)) throw new Error('no back button');
    backButton.click();
    await vi.waitFor(() => {
      expect(el.state.route?.name).toBe('home');
    });
  });

  it('shows a not-found view for unknown paths', async () => {
    const { $, link } = await mount('/missing/page');
    expect($('h1')?.textContent).toContain('404');
    expect($('main code')?.textContent).toBe('/missing/page');
    expect(link('Home').hasAttribute('aria-current')).toBe(false);
  });
});

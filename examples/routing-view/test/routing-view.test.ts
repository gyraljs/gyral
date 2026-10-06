import { afterEach, describe, expect, it, vi } from 'vitest';
import { settled } from '@gyral/core';
import { step } from '@gyral/testing';
import { makeRouter, type RouterDriver } from '@gyral/router';
import { app, pageTitle, RoutingView } from '../src/app.js';

let driver: RouterDriver | undefined;

async function mount(path: string) {
  // Memory history: the real document URL and title are never touched (ADR 0009).
  const router = makeRouter({ history: 'memory', initial: path, captureLinks: true });
  driver = router;
  const el = new RoutingView();
  el.drivers = { router };
  document.body.append(el);
  await settled();
  await vi.waitFor(() => {
    expect(el.state.location).toBeDefined();
  });
  await settled();
  const $ = (sel: string) => el.shadowRoot?.querySelector(sel);
  const link = (name: string) => {
    const a = [...(el.shadowRoot?.querySelectorAll('nav a') ?? [])].find(
      (x) => x.textContent.trim() === name,
    );
    if (!(a instanceof HTMLAnchorElement)) throw new Error(`no link ${name}`);
    return a;
  };
  return { el, $, link, router };
}

afterEach(() => {
  document.body.replaceChildren();
  driver?.dispose();
  driver = undefined;
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

  it('derives the document title from the route', () => {
    expect(pageTitle(app.match('https://x.test/about'))).toBe('About — Gyral routing');
    expect(pageTitle(undefined)).toBe('Page not found — Gyral routing');
  });

  it('renders the initial route and marks its link as current', async () => {
    const { $, link } = await mount('/about');
    expect($('h1')?.textContent).toBe('About me');
    expect(link('About').getAttribute('aria-current')).toBe('page');
    expect(link('Home').hasAttribute('aria-current')).toBe(false);
  });

  it('navigates on link clicks without reloading', async () => {
    const { el, $, link, router } = await mount('/');
    link('Contacts').click();
    await vi.waitFor(() => {
      expect(el.state.route?.name).toBe('contacts');
    });
    await settled();
    expect(new URL(router.snapshot().href).pathname).toBe('/contacts');
    await vi.waitFor(() => {
      expect(router.snapshot().title).toBe('Contacts — Gyral routing');
    });
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

import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// The server's real output for /about (kept in sync by server.node.test.ts).
import serverHtml from './fixtures/about.ssr.html?raw';

let page: MountedSsr | undefined;
const original = location.href;
const originalTitle = document.title;
const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');

function app(): HTMLElement {
  const el = document.querySelector('gy-iso-app');
  if (!(el instanceof HTMLElement) || el.shadowRoot === null) throw new Error('no app');
  return el;
}
const $ = (sel: string) => app().shadowRoot?.querySelector(sel);
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeAll(() => {
  // The client's router reads the real URL; match what the server rendered.
  history.replaceState(null, '', '/about');
  page = mountSsr(serverHtml);
});

afterAll(() => {
  history.replaceState(null, '', original);
  document.title = originalTitle;
  page?.unmount();
});

// Re-enable in Phase 5 (gyral-g1r.10): needs hydration. Its server markup (the fixture) comes from Phase 4.
describe.skip('hydration', () => {
  it('paints from the server markup before any component code loads', () => {
    expect(customElements.get('gy-iso-app')).toBeUndefined();
    expect($('h1')?.textContent).toBe('Read more about us');
  });

  it('hydrates in place: same DOM nodes, seed consumed, no mismatch', async () => {
    const h1 = $('h1');
    await import('../src/app.js');
    await import('../src/contact.js'); // lazy on the About page, as in entry-client.ts
    const el = app() as HTMLElement & { state: unknown };
    if (page === undefined) throw new Error('not mounted');
    await hydrated(page); // rejects on a mismatch or any console error/warning
    await settle();
    expect($('h1')).toBe(h1);
    expect(app().shadowRoot?.querySelectorAll('h1')).toHaveLength(1);
    expect(el.state).toEqual({ path: '/about' });
    expect(el.hasAttribute('data-gyral-seed')).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('is interactive after hydration: in-app links navigate without a reload', async () => {
    const home = $('a[href="/"]');
    if (!(home instanceof HTMLAnchorElement)) throw new Error('no home link');
    home.click();
    await settle();
    expect(location.pathname).toBe('/');
    expect($('h1')?.textContent).toBe('The homepage');
    expect($('a[aria-current="page"]')?.getAttribute('href')).toBe('/');
    // Same pageTitle() the server used for <title>.
    expect(document.title).toBe('The homepage — Gyral isomorphic');
  });
});

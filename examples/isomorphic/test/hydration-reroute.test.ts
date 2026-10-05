// ORDER IS LOAD-BEARING: hydrate support before anything that imports `lit` (ADR 0012).
import '@gyral/ssr/hydrate';
import { hydrated, mountSsr } from '@gyral/testing';
import { afterAll, expect, it } from 'vitest';
import serverHtml from './fixtures/about.ssr.html?raw';

const original = location.href;
let unmount = (): void => undefined;

afterAll(() => {
  history.replaceState(null, '', original);
  unmount();
});

// The router answers synchronously with the current URL. If init's commands ran before the
// hydrating render, state would change first and hydration would fail with a mismatch.
it('hydrates the server state first, then applies what init commands report', async () => {
  history.replaceState(null, '', '/'); // the browser is somewhere else than the server render
  const page = mountSsr(serverHtml);
  unmount = page.unmount;
  const nav = document.querySelector('gy-iso-app')?.shadowRoot?.querySelector('nav');

  const { App } = await import('../src/app.js');
  const el = document.querySelector('gy-iso-app');
  if (!(el instanceof App)) throw new Error('not upgraded');
  await hydrated(page); // rejects on "Hydration value mismatch" or console errors
  await new Promise((r) => setTimeout(r, 20));
  await el.updateComplete;

  expect(el.state).toEqual({ path: '/' });
  expect(el.shadowRoot?.querySelector('h1')?.textContent).toBe('The homepage');
  // The menu template didn't change, so its hydrated nodes were reused, not re-created.
  expect(el.shadowRoot?.querySelector('nav')).toBe(nav);
});

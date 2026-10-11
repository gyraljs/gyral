import { afterEach, expect, it, vi } from 'vitest';
import { makeHttpDriver } from '../src/index.js';

// Production builds drop the missing-token check (ADR 0022): no warning, no <meta> lookup.
afterEach(() => {
  document.head.querySelector('meta[name=csrf-token]')?.remove();
});

it('never warns about a missing CSRF token in production', async () => {
  const meta = document.createElement('meta');
  meta.name = 'csrf-token';
  meta.content = 'tok-7';
  document.head.append(meta);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(Response.json({})));
  const driver = makeHttpDriver({ fetch, baseUrl: 'https://a.test/' });
  await driver.run(
    { url: 'x', method: 'POST' },
    { signal: new AbortController().signal, emit: () => undefined },
  );
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

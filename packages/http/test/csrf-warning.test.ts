import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// Development builds warn once when a non-GET request goes out while the page has a CSRF
// <meta> whose token no header carries (ADR 0022). Each test loads a fresh driver module, so
// the once-per-page flag starts unset.

const ctx = () => ({ signal: new AbortController().signal, emit: (): void => undefined });
const fakeFetch = () => vi.fn<typeof fetch>(() => Promise.resolve(Response.json({})));

async function freshDriver() {
  vi.resetModules();
  return import('../src/index.js');
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  const meta = document.createElement('meta');
  meta.name = 'csrf-token';
  meta.content = 'tok-7';
  document.head.append(meta);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  document.head.querySelector('meta[name=csrf-token]')?.remove();
  warn.mockRestore();
});

describe('missing CSRF token warning (development)', () => {
  it('warns once for a POST without the token, naming csrfFromMeta', async () => {
    const { makeHttpDriver } = await freshDriver();
    const driver = makeHttpDriver({ fetch: fakeFetch(), baseUrl: 'https://a.test/' });
    await driver.run({ url: 'x', method: 'POST', body: { a: 1 } }, ctx());
    await driver.run({ url: 'y', method: 'DELETE' }, ctx());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("csrfFromMeta('csrf-token')");
  });

  it('stays quiet for GET requests', async () => {
    const { makeHttpDriver } = await freshDriver();
    const driver = makeHttpDriver({ fetch: fakeFetch(), baseUrl: 'https://a.test/' });
    await driver.run({ url: 'x' }, ctx());
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet when the driver adds the token', async () => {
    const { csrfFromMeta, makeHttpDriver } = await freshDriver();
    const fetch = fakeFetch();
    const driver = makeHttpDriver({
      fetch,
      baseUrl: 'https://a.test/',
      headers: csrfFromMeta('csrf-token'),
    });
    await driver.run({ url: 'x', method: 'POST' }, ctx());
    expect(warn).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'tok-7' });
  });

  it('stays quiet when the request carries the token itself (submitForm({ csrf: { token } }))', async () => {
    const { makeHttpDriver } = await freshDriver();
    const driver = makeHttpDriver({ fetch: fakeFetch(), baseUrl: 'https://a.test/' });
    await driver.run({ url: 'x', method: 'POST', headers: { 'x-xsrf': 'tok-7' } }, ctx());
    expect(warn).not.toHaveBeenCalled();
  });

  it('adds no CSRF header unless a header source adds one', async () => {
    const { makeHttpDriver } = await freshDriver();
    const fetch = fakeFetch();
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://a.test/' });
    await driver.run({ url: 'x', method: 'POST' }, ctx());
    const headers = (fetch.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(Object.values(headers)).not.toContain('tok-7');
  });
});

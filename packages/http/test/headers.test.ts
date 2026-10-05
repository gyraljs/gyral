import { afterEach, describe, expect, it, vi } from 'vitest';
import { csrfFromMeta, makeHttpDriver } from '../src/index.js';

const ctx = () => ({ signal: new AbortController().signal, emit: (): void => undefined });

const fakeFetch = () => vi.fn<typeof fetch>(() => Promise.resolve(Response.json({})));

const headersOf = (fetch: ReturnType<typeof fakeFetch>, call = 0) =>
  (fetch.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;

function setMeta(name: string, content: string): void {
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.append(meta);
}

afterEach(() => {
  document.head.querySelectorAll('meta[name=csrf-token]').forEach((m) => {
    m.remove();
  });
});

describe('app-level headers (makeHttpDriver({ headers }))', () => {
  it('adds static default headers to every request', async () => {
    const fetch = fakeFetch();
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://a.test/', headers: { 'x-api': 'k' } });
    await driver.run({ url: 'x' }, ctx());
    expect(headersOf(fetch)).toMatchObject({ accept: 'application/json', 'x-api': 'k' });
  });

  it('evaluates a header function per request, seeing the request', async () => {
    const fetch = fakeFetch();
    let n = 0;
    const driver = makeHttpDriver({
      fetch,
      baseUrl: 'https://a.test/',
      headers: (req) => ({ 'x-n': String((n += 1)), 'x-url': req.url }),
    });
    await driver.run({ url: 'a' }, ctx());
    await driver.run({ url: 'b' }, ctx());
    expect(headersOf(fetch, 0)).toMatchObject({ 'x-n': '1', 'x-url': 'a' });
    expect(headersOf(fetch, 1)).toMatchObject({ 'x-n': '2', 'x-url': 'b' });
  });

  it('lets per-request headers override the defaults', async () => {
    const fetch = fakeFetch();
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://a.test/', headers: { 'x-a': '1' } });
    await driver.run({ url: 'x', headers: { 'x-a': '2' } }, ctx());
    expect(headersOf(fetch)['x-a']).toBe('2');
  });

  it('csrfFromMeta reads the token when the request runs, not when configured', async () => {
    const fetch = fakeFetch();
    const driver = makeHttpDriver({
      fetch,
      baseUrl: 'https://a.test/',
      headers: csrfFromMeta('csrf-token'),
    });
    await driver.run({ url: 'x', method: 'POST', body: {} }, ctx());
    expect(headersOf(fetch, 0)['x-csrf-token']).toBeUndefined();
    setMeta('csrf-token', 'tok-9');
    await driver.run({ url: 'x', method: 'POST', body: {} }, ctx());
    expect(headersOf(fetch, 1)['x-csrf-token']).toBe('tok-9');
  });

  it('csrfFromMeta supports a custom header name', () => {
    setMeta('csrf-token', 'abc');
    expect(csrfFromMeta('csrf-token', 'x-xsrf')()).toEqual({ 'x-xsrf': 'abc' });
  });
});

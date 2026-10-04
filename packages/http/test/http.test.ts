import { describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { makeHttpDriver } from '../src/index.js';

const ctx = () => ({ signal: new AbortController().signal });

function fakeFetch(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response()));
}

/** A minimal hand-written Standard Schema: an object with a string `name`. */
const named: StandardSchemaV1<unknown, { name: string }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) =>
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      typeof value.name === 'string'
        ? { value: { name: value.name } }
        : { issues: [{ message: 'expected { name: string }' }] },
  },
};

async function failure(promise: unknown, toError: (cause: unknown) => unknown) {
  try {
    await promise;
  } catch (cause) {
    return toError(cause);
  }
  throw new Error('expected a failure');
}

describe('makeHttpDriver', () => {
  it('GETs JSON relative to baseUrl and passes the abort signal', async () => {
    const fetch = fakeFetch(() => Response.json({ ok: 1 }));
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://api.test/v1/' });
    const signal = new AbortController().signal;
    await expect(driver.run({ url: 'items' }, { signal })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/v1/items');
    expect(init?.method).toBe('GET');
    expect(init?.signal).toBe(signal);
  });

  it('sends JSON bodies with headers', async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 204 }));
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://api.test/' });
    await driver.run({ url: '/x', method: 'POST', body: { a: 1 }, headers: { 'x-k': 'v' } }, ctx());
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"a":1}');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json', 'x-k': 'v' });
  });

  it('maps non-2xx responses to HttpStatusError', async () => {
    const driver = makeHttpDriver({
      fetch: fakeFetch(() => new Response('nope', { status: 404, statusText: 'Not Found' })),
      baseUrl: 'https://api.test/',
    });
    const toError = driver.toError ?? String;
    expect(await failure(driver.run({ url: '/missing' }, ctx()), toError)).toEqual({
      _tag: 'HttpStatusError',
      url: 'https://api.test/missing',
      status: 404,
      statusText: 'Not Found',
    });
  });

  it('maps fetch rejections to HttpNetworkError', async () => {
    const driver = makeHttpDriver({
      fetch: () => Promise.reject(new TypeError('offline')),
      baseUrl: 'https://api.test/',
    });
    const toError = driver.toError ?? String;
    expect(await failure(driver.run({ url: '/x' }, ctx()), toError)).toMatchObject({
      _tag: 'HttpNetworkError',
      message: 'offline',
    });
  });

  it('decodes with a Standard Schema and reports issues as HttpDecodeError', async () => {
    const ok = makeHttpDriver({ fetch: fakeFetch(() => Response.json({ name: 'gy', x: 1 })) });
    await expect(ok.run({ url: '/u', schema: named }, ctx())).resolves.toEqual({ name: 'gy' });

    const bad = makeHttpDriver({ fetch: fakeFetch(() => Response.json({ nom: 'gy' })) });
    const toError = bad.toError ?? String;
    expect(await failure(bad.run({ url: '/u', schema: named }, ctx()), toError)).toMatchObject({
      _tag: 'HttpDecodeError',
      issues: [{ message: 'expected { name: string }' }],
    });
  });

  it('reports invalid JSON as HttpDecodeError', async () => {
    const driver = makeHttpDriver({ fetch: fakeFetch(() => new Response('<html>')) });
    const toError = driver.toError ?? String;
    expect(await failure(driver.run({ url: '/u' }, ctx()), toError)).toMatchObject({
      _tag: 'HttpDecodeError',
    });
  });
});

// Range requests on hashed assets (gyral-dyn.32): one range gets a 206 with that slice, so
// media can seek; anything else the whole file, as RFC 9110 allows.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assetHandler } from '../src/static.js';
import { byteRange } from '../src/assets.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function serve() {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-range-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'clip.mp4'), '0123456789');
  const handler = assetHandler({ dir, cache: false });
  return async (range: string | undefined, method = 'GET'): Promise<Response> => {
    const headers: Record<string, string> = range === undefined ? {} : { range };
    const response = await handler(new Request('http://x/assets/clip.mp4', { method, headers }));
    if (response === undefined) throw new Error('not handled');
    return response;
  };
}

describe('byteRange', () => {
  it.each([
    ['bytes=2-5', [2, 5]],
    ['bytes=7-', [7, 9]],
    ['bytes=-3', [7, 9]],
    ['bytes=-30', [0, 9]],
    ['bytes=8-99', [8, 9]],
    ['bytes=10-', null],
    ['bytes=-0', null],
    ['bytes=5-2', undefined],
    ['bytes=0-1,4-5', undefined],
    ['items=0-1', undefined],
    ['bytes=-', undefined],
  ] as const)('%s of 10 bytes', (header, expected) => {
    expect(byteRange(header, 10)).toEqual(expected);
  });
});

describe('assetHandler ranges', () => {
  it('a whole file says it accepts ranges', async () => {
    const res = await serve()(undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('0123456789');
  });

  it('one range: 206 with the slice and content-range', async () => {
    const res = await serve()('bytes=2-5');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(res.headers.get('content-length')).toBe('4');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(await res.text()).toBe('2345');
  });

  it('HEAD with a range: the 206 headers, no body', async () => {
    const res = await serve()('bytes=-3', 'HEAD');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await res.text()).toBe('');
  });

  it('an unsatisfiable range: 416 with the size; several ranges: the whole file', async () => {
    const get = serve();
    const none = await get('bytes=20-');
    expect(none.status).toBe(416);
    expect(none.headers.get('content-range')).toBe('bytes */10');
    const several = await get('bytes=0-1,4-5');
    expect(several.status).toBe(200);
    expect(await several.text()).toBe('0123456789');
  });
});

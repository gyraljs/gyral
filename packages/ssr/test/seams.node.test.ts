// The seams a fetch router needs around Gyral's server half (ADR 0025): JSON-only form
// endpoints, `wantsJson` for routes that answer both ways, and `productionServer`'s
// `onResponse` for headers and cookies on every response.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { defineForm } from '@gyral/core';
import { formAction, seeOther, wantsJson } from '../src/index.js';
import { productionServer } from '../src/static.js';

const Note = defineForm(v.object({ text: v.pipe(v.string(), v.minLength(1, 'Required')) }));
const post = (fields: Record<string, string>, accept: string) => {
  const body = new FormData();
  for (const [k, val] of Object.entries(fields)) body.set(k, val);
  return new Request('http://x/notes', { method: 'POST', body, headers: { accept } });
};

describe('formAction without `invalid` (an endpoint only submitForm calls)', () => {
  const handle = formAction(Note, { intent: 'Save', valid: () => seeOther('/notes') });

  it('answers every rejection with the JSON 422, whatever the Accept header', async () => {
    for (const accept of ['application/json', 'text/html']) {
      const res = await handle(post({ text: '' }, accept));
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ _tag: 'IntentRejected', intent: 'Save' });
    }
  });

  it('keeps a browser post of a valid form as the redirect', async () => {
    const res = await handle(post({ text: 'hi' }, 'text/html'));
    expect(res.status).toBe(303);
  });
});

describe('wantsJson', () => {
  it('is true for fetch calls asking for JSON, false for a browser navigation', () => {
    const req = (accept: string) => new Request('http://x/', { headers: { accept } });
    expect(wantsJson(req('application/json'))).toBe(true);
    expect(wantsJson(req('text/html,application/xhtml+xml,application/json;q=0.9'))).toBe(false);
    expect(wantsJson(req('*/*'))).toBe(false);
  });
});

describe("productionServer's onResponse", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('sees every response: built assets, prerendered pages and the app', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'gyral-seams-'));
    dirs.push(dist);
    mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
    mkdirSync(join(dist, 'client', 'assets'), { recursive: true });
    mkdirSync(join(dist, 'static', 'about'), { recursive: true });
    writeFileSync(
      join(dist, 'client', '.vite', 'manifest.json'),
      JSON.stringify({ 'src/entry-client.ts': { file: 'assets/entry-E.js', isEntry: true } }),
    );
    writeFileSync(join(dist, 'client', 'assets', 'entry-E.js'), 'export {};');
    writeFileSync(join(dist, 'static', 'about', 'index.html'), '<p>about</p>');
    const server = await productionServer({
      distDir: dist,
      createApp: () => ({ fetch: () => new Response('app') }),
      onResponse: (response, request) => {
        const headers = new Headers(response.headers);
        headers.set('x-frame-options', 'DENY');
        headers.set('x-path', new URL(request.url).pathname);
        return new Response(response.body, { status: response.status, headers });
      },
    });
    for (const path of ['/assets/entry-E.js', '/about', '/anything']) {
      const res = await server.fetch(new Request(new URL(path, 'http://x')));
      expect(res.status).toBe(200);
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-path')).toBe(path);
    }
  });
});

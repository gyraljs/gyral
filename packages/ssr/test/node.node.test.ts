// gyral-dyn.6: `@gyral/ssr/node`'s `toNodeListener` on a real `node:http` server.
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderPage } from '../src/index.js';
import { toNodeListener, type FetchHandler, type NodeListenerOptions } from '../src/node.js';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** Starts a server on a free port and returns its base URL. */
async function serve(handler: FetchHandler, options?: NodeListenerOptions): Promise<string> {
  const server = createServer(toNodeListener(handler, options));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** A raw request, for what fetch hides (the request target, repeated headers). */
function raw(
  base: string,
  path: string,
  method = 'GET',
): Promise<{ res: IncomingMessage; body: string }> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(base);
    const req = httpRequest({ host: hostname, port, method, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => {
        resolve({ res, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

describe('toNodeListener (gyral-dyn.6)', () => {
  it('passes method, URL, headers and a streamed body to the handler', async () => {
    const base = await serve(async (request) => {
      const body = await request.text();
      return Response.json({
        method: request.method,
        url: request.url,
        type: request.headers.get('content-type'),
        custom: request.headers.get('x-custom'),
        body,
      });
    });
    const res = await fetch(`${base}/echo?q=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-custom': 'yes' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello '));
          controller.enqueue(new TextEncoder().encode('world'));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect(await res.json()).toEqual({
      method: 'POST',
      url: `${base}/echo?q=1`,
      type: 'text/plain',
      custom: 'yes',
      body: 'hello world',
    });
  });

  it('builds URLs on the configured origin, and never from the request target', async () => {
    const base = await serve((request) => new Response(request.url), {
      origin: 'https://example.com',
    });
    expect((await raw(base, '/a?b=c')).body).toBe('https://example.com/a?b=c');
    expect((await raw(base, '//evil.example/x')).body).toBe('https://example.com//evil.example/x');
    expect((await raw(base, 'http://evil.example/y?z')).body).toBe('https://example.com/y?z');
    expect((await raw(base, 'http://evil.example//w')).body).toBe('https://example.com//w');
  });

  it('serves a renderPage response, status and headers included', async () => {
    const base = await serve(() =>
      renderPage({ title: 'Hi', body: html`<p>Hello</p>` }, { status: 404 }),
    );
    const res = await fetch(`${base}/missing`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('<p>Hello</p>');
  });

  it('sends only the headers for HEAD', async () => {
    let cancelled = false;
    const base = await serve(
      () =>
        new Response(
          new ReadableStream({
            pull: (c) => {
              c.enqueue(new Uint8Array(8));
            },
            cancel: () => void (cancelled = true),
          }),
          { headers: { 'content-length': '8', 'x-kind': 'head' } },
        ),
    );
    const { res, body } = await raw(base, '/', 'HEAD');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-length']).toBe('8');
    expect(res.headers['x-kind']).toBe('head');
    expect(body).toBe('');
    await until(() => cancelled);
  });

  it('keeps each set-cookie header apart', async () => {
    const base = await serve(() => {
      const headers = new Headers();
      headers.append('set-cookie', 'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT');
      headers.append('set-cookie', 'b=2; HttpOnly');
      return new Response('ok', { headers });
    });
    const { res } = await raw(base, '/');
    expect(res.headers['set-cookie']).toEqual([
      'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
      'b=2; HttpOnly',
    ]);
  });

  it('pulls the body only as fast as the client reads, and aborts when it leaves', async () => {
    let pulls = 0;
    let cancelled = false;
    let aborted = false;
    const chunk = new Uint8Array(64 * 1024);
    const base = await serve((request) => {
      request.signal.addEventListener('abort', () => (aborted = true));
      return new Response(
        new ReadableStream(
          {
            pull(controller) {
              pulls += 1;
              controller.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
      );
    });
    const req = httpRequest(`${base}/endless`);
    const res = await new Promise<IncomingMessage>((resolve) => {
      req.on('response', resolve);
      req.end();
    });
    res.pause(); // a client that stops reading
    await new Promise((r) => setTimeout(r, 300));
    const paused = pulls;
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThan(200); // an unbounded producer would have run far ahead
    await new Promise((r) => setTimeout(r, 200));
    expect(pulls - paused).toBeLessThan(4); // and it stays put while nobody reads
    req.on('error', () => {}); // the socket we destroy
    req.destroy();
    await until(() => cancelled && aborted);
  });

  it('answers 500 when the handler throws, and reports it', async () => {
    const errors: unknown[] = [];
    const base = await serve(
      () => {
        throw new Error('boom');
      },
      { onError: (error) => errors.push(error) },
    );
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(errors).toEqual([new Error('boom')]);
  });

  it('cuts the connection when the body fails after the headers are out', async () => {
    const errors: unknown[] = [];
    const base = await serve(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('partial'));
            },
            pull(controller) {
              controller.error(new Error('render failed'));
            },
          }),
        ),
      { onError: (error) => errors.push(error) },
    );
    // Never a response that looks complete: the request or the body read fails.
    await expect(fetch(`${base}/`).then((res) => res.text())).rejects.toThrow();
    expect(errors).toHaveLength(1);
  });

  it('answers 400 for a Host header that is no host', async () => {
    const base = await serve(() => new Response('never'));
    const { res } = await new Promise<{ res: IncomingMessage }>((resolve, reject) => {
      const req = httpRequest(`${base}/`, { headers: { host: 'a b' } }, (r) => {
        r.resume();
        r.on('end', () => {
          resolve({ res: r });
        });
      });
      req.on('error', reject);
      req.end();
    });
    expect(res.statusCode).toBe(400);
  });
});

// gyral-dyn.30: `toNodeListener` with request bodies the handler doesn't read, clients that
// leave before the response starts, and a reporter that throws.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { Agent, createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  toNodeListener,
  type FetchHandler,
  type NodeEnv,
  type NodeListenerOptions,
} from '../src/node.js';
import { productionServer } from '../src/static.js';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function serve(handler: FetchHandler, options?: NodeListenerOptions): Promise<string> {
  const server = createServer(toNodeListener(handler, options));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};
describe('toNodeListener: unread bodies and early disconnects', () => {
  /** A request on `agent`, with a body; resolves with the status once the response ends. */
  const send = (agent: Agent, base: string, path: string, body?: Uint8Array): Promise<number> =>
    new Promise((resolve, reject) => {
      const { hostname, port } = new URL(base);
      const req = httpRequest(
        { agent, host: hostname, port, path, method: body === undefined ? 'GET' : 'POST' },
        (res) => {
          res.resume();
          res.on('end', () => {
            resolve(res.statusCode ?? 0);
          });
        },
      );
      req.setTimeout(5_000, () => req.destroy(new Error(`${path} hung`)));
      req.on('error', reject);
      req.end(body);
    });

  it('a handler that never reads a large body leaves the keep-alive socket usable', async () => {
    const base = await serve((request) =>
      new URL(request.url).pathname === '/upload'
        ? new Response('no', { status: 404 })
        : new Response('ok'),
    );
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      expect(await send(agent, base, '/upload', new Uint8Array(512 * 1024))).toBe(404);
      expect(await send(agent, base, '/next')).toBe(200);
    } finally {
      agent.destroy();
    }
  });

  it('a handler that reads part of a body and answers does not stall the next request', async () => {
    const base = await serve(async (request) => {
      if (new URL(request.url).pathname !== '/upload') return new Response('ok');
      const reader = request.body?.getReader();
      await reader?.read(); // one chunk, then answer
      return new Response('early', { status: 413 });
    });
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      expect(await send(agent, base, '/upload', new Uint8Array(2 * 1024 * 1024))).toBe(413);
      expect(await send(agent, base, '/next')).toBe(200);
    } finally {
      agent.destroy();
    }
  });

  it('cancels the response body when the client left before sending started', async () => {
    let cancelled = false;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const base = await serve(async () => {
      await gate; // the client leaves while the handler is still working
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(16));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    });
    const req = httpRequest(`${base}/slow`);
    req.on('error', () => {});
    req.end();
    await new Promise((r) => setTimeout(r, 100));
    req.destroy();
    await new Promise((r) => setTimeout(r, 100));
    release();
    await until(() => cancelled);
  });

  it('a throwing onError does not crash the process', async () => {
    const base = await serve(
      () => {
        throw new Error('boom');
      },
      {
        onError: () => {
          throw new Error('reporter failed');
        },
      },
    );
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(500);
  });
});

describe('productionServer behind toNodeListener', () => {
  it("passes the server's env on to the app, so it sees the client's address", async () => {
    const dist = mkdtempSync(join(tmpdir(), 'gyral-env-'));
    try {
      mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
      writeFileSync(
        join(dist, 'client', '.vite', 'manifest.json'),
        JSON.stringify({ 'src/entry-client.ts': { file: 'assets/entry.js' } }),
      );
      const server = await productionServer<NodeEnv>({
        distDir: dist,
        staticDir: false,
        createApp: () => ({
          fetch: (_request, env) => new Response(env?.remoteAddress ?? 'none'),
        }),
      });
      const base = await serve(server.fetch);
      expect(await (await fetch(`${base}/who`)).text()).toBe('127.0.0.1');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

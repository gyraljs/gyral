// Real HTTP and the official v1 SDK client: negotiate, use tools, refuse unsafe ingress.
import { once } from 'node:events';
import { createServer as reserveServer, request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCorpus } from '../scripts/build-corpus.mjs';
import { parseLlmsFull } from '../src/docs.js';
import { createHttpServer } from '../src/http.js';
import type { Corpus } from '../src/types.js';

let corpus: Corpus;
let app: ReturnType<typeof createHttpServer>;
let url: URL;
const client = new Client({ name: 'public-mcp-test', version: '1' });
const host = 'mcp.gyral.test';

async function start(options: { requestsPerMinute?: number; maxConcurrent?: number } = {}) {
  const reservation = reserveServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (address === null || typeof address === 'string') throw new Error('Missing HTTP address');
  const endpoint = new URL(`http://127.0.0.1:${String(address.port)}/mcp`);
  await new Promise<void>((resolve) =>
    reservation.close(() => {
      resolve();
    }),
  );
  const running = createHttpServer(corpus, {
    publicOrigin: endpoint.origin,
    allowedOrigins: ['https://agent.test'],
    ...options,
  });
  running.server.listen(address.port, '127.0.0.1');
  await once(running.server, 'listening');
  return { running, endpoint };
}

beforeAll(async () => {
  corpus = buildCorpus(parseLlmsFull);
  const started = await start();
  app = started.running;
  url = started.endpoint;
  await client.connect(new StreamableHTTPClientTransport(url) as Transport);
}, 60_000);

afterAll(async () => {
  await client.close();
  await app.close();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  return JSON.stringify(await client.callTool({ name, arguments: args }));
}

describe('public MCP', () => {
  it('negotiates stateless tools, instructions, resources and prompts', async () => {
    expect(client.getServerVersion()?.version).toBe(corpus.version);
    expect(client.getInstructions()).toContain('cannot inspect your installed packages');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_api',
      'get_doc',
      'get_example',
      'list_examples',
      'scaffold_component',
      'search_docs',
      'start_here',
    ]);
    const scaffold = tools.find((t) => t.name === 'scaffold_component');
    // A public server never reads paths on its own disk.
    expect(Object.keys(scaffold?.inputSchema.properties ?? {})).not.toContain('project_dir');
    expect(scaffold?.description).toContain('typecheck it in the project');
    expect((await client.listResources()).resources.map((r) => r.uri)).toContain('gyral://skill');
    expect(JSON.stringify(await client.readResource({ uri: 'gyral://skill' }))).toContain(
      'Golden rules',
    );
    const prompt = await client.getPrompt({
      name: 'build-gyral-component',
      arguments: { tag: 'test-probe', description: 'Test' },
    });
    expect(JSON.stringify(prompt)).toContain('project typecheck');
  });

  it('answers all seven tools and refuses server-side snippet checks', async () => {
    expect(await call('start_here')).toContain('npx -y @gyral/mcp');
    expect(await call('get_doc', { path: 'forms' })).toContain('formAction');
    const tested = await call('scaffold_component', {
      tag: 'test-probe',
      kind: 'basic',
      installed: ['@gyral/core', '@gyral/testing', 'vitest'],
    });
    expect(tested).toContain('test-probe.test.ts');
    expect(await call('get_api', { symbol: 'define' })).toContain('@gyral/core');
    expect(await call('get_doc', { path_or_url: 'forms' })).toContain('formAction');
    expect(await call('search_docs', { query: 'subscriptions' })).toContain('gyral.dev');
    expect(await call('list_examples')).toContain('hello-world');
    expect(await call('get_example', { name: 'hello-world' })).toContain('src/hello.ts');
    expect(await call('scaffold_component', { tag: 'test-probe', kind: 'basic' })).toContain(
      'define<State, Msg>',
    );
    expect(JSON.parse(await call('check_snippet', { code: 'process.exit()' }))).toMatchObject({
      isError: true,
    });
  });

  it('reports corpus identity and closes per-request servers', async () => {
    const health = await fetch(new URL('/healthz', url));
    expect(await health.json()).toMatchObject({
      version: corpus.version,
      active: 0,
      corpusSha256: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
    });
    const responses = await Promise.all(Array.from({ length: 8 }, () => client.listTools()));
    expect(responses.every((r) => r.tools.length === 7)).toBe(true);
  });

  it('rejects hostile Host/Origin, oversized and malformed bodies', async () => {
    const hostile = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url, { headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    expect(hostile).toBe(403);
    expect((await fetch(url, { headers: { Origin: 'https://attacker.test' } })).status).toBe(403);
    expect((await fetch(url, { method: 'POST', body: 'x'.repeat(16_385) })).status).toBe(413);
    expect((await fetch(url, { method: 'POST', body: 'invalid' })).status).toBe(400);
    expect((await fetch(url)).status).toBe(405);
    const cors = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://agent.test' } });
    expect(cors.status).toBe(204);
    expect(cors.headers.get('Access-Control-Allow-Origin')).toBe('https://agent.test');
  });

  it('enforces the global request ceiling', async () => {
    const { running: limited, endpoint } = await start({ requestsPerMinute: 1 });
    try {
      expect((await fetch(endpoint, { method: 'POST', body: 'bad' })).status).toBe(400);
      const excess = await fetch(endpoint, { method: 'POST', body: '{}' });
      expect(excess.status).toBe(429);
      expect(excess.headers.get('Retry-After')).toBe('60');
    } finally {
      await limited.close();
    }
  });

  it('reserves capacity for slow uploads and disposes a disconnected request', async () => {
    const { running: limited, endpoint } = await start({ maxConcurrent: 1 });
    const slow = request(endpoint, { method: 'POST' });
    slow.on('error', () => {});
    slow.write('{');
    try {
      await vi.waitFor(async () => {
        const health = await fetch(new URL('/healthz', endpoint));
        expect(await health.json()).toMatchObject({ active: 1 });
      });
      expect((await fetch(endpoint, { method: 'POST', body: '{}' })).status).toBe(429);
      slow.destroy();
      await vi.waitFor(async () => {
        const health = await fetch(new URL('/healthz', endpoint));
        expect(await health.json()).toMatchObject({ active: 0 });
      });
    } finally {
      slow.destroy();
      await limited.close();
    }
  });

  it('validates explicit origin and capacity configuration', () => {
    for (const publicOrigin of [
      'http://public.test',
      'https://public.test/path',
      'https://a:b@public.test',
    ])
      expect(() => createHttpServer(corpus, { publicOrigin })).toThrow();
    expect(() =>
      createHttpServer(corpus, { publicOrigin: `https://${host}`, maxConcurrent: 0 }),
    ).toThrow();
  });
});

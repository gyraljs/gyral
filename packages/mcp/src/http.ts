// Public, stateless Streamable HTTP. No project paths, snippet execution or live refresh.
import { createHash } from 'node:crypto';
import { createServer as nodeServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createServer } from './server.js';
import type { Corpus } from './types.js';

export interface HttpOptions {
  readonly publicOrigin: string;
  /** Explicit browser clients; machine clients may omit Origin. */
  readonly allowedOrigins?: readonly string[];
  readonly maxConcurrent?: number;
  /** Global ceiling; apply per-client limits at the trusted TLS proxy. */
  readonly requestsPerMinute?: number;
}

function origin(value: string): URL {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error(
      'Public origin must be HTTPS (HTTP only for loopback), with no path or credentials',
    );
  return url;
}

function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('Capacity must be a positive integer');
  return value;
}

function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
    size += bytes.length;
    if (size > 16_384) throw new RangeError('Request body exceeds 16 KiB');
    parts.push(bytes);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}

/** Internal hosting adapter; the public embedding API remains createServer + a transport. */
export function createHttpServer(corpus: Corpus, options: HttpOptions) {
  const publicUrl = origin(options.publicOrigin);
  const origins = new Set([
    publicUrl.origin,
    ...(options.allowedOrigins ?? []).map((v) => origin(v).origin),
  ]);
  const maxConcurrent = positive(options.maxConcurrent ?? 32);
  const perMinute = positive(options.requestsPerMinute ?? 600);
  const digest = createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
  const active = new Set<ReturnType<typeof createServer>>();
  let windowStart = Date.now();
  let count = 0;
  let closing = false;

  const server = nodeServer((req, res) => {
    req.setTimeout(10_000, () => req.destroy());
    void handle(req, res).catch(() => {
      if (!res.headersSent && !res.destroyed) respond(res, 500, { error: 'Request failed' });
      else res.destroy();
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.host !== publicUrl.host) {
      respond(res, 403, { error: 'Untrusted Host' });
      return;
    }
    const requestOrigin = req.headers.origin;
    if (requestOrigin !== undefined && !origins.has(requestOrigin)) {
      respond(res, 403, { error: 'Untrusted Origin' });
      return;
    }
    if (requestOrigin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    }
    if (closing) {
      respond(res, 503, { error: 'Shutting down' });
      return;
    }
    if (req.url === '/healthz' && req.method === 'GET') {
      respond(res, 200, {
        version: corpus.version,
        corpusSha256: digest,
        transport: 'streamable-http',
        active: active.size,
      });
      return;
    }
    if (req.url !== '/mcp') {
      respond(res, 404, { error: 'Not found' });
      return;
    }
    if (req.method === 'OPTIONS' && requestOrigin !== undefined) {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      respond(res, 405, { error: 'Stateless endpoint accepts POST only' });
      return;
    }
    if (Date.now() - windowStart >= 60_000) {
      windowStart = Date.now();
      count = 0;
    }
    if (active.size >= maxConcurrent || count >= perMinute) {
      res.setHeader('Retry-After', '60');
      respond(res, 429, { error: 'Capacity exceeded' });
      return;
    }
    count++;
    // Reserve capacity before reading the body; slow uploads are bounded too.
    const mcp = createServer(corpus, { snippetChecks: false });
    active.add(mcp);
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true, // no sessionIdGenerator means stateless
    });
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      active.delete(mcp);
      void mcp.close().catch(() => {
        res.destroy();
      });
    };
    res.once('close', dispose);
    try {
      const length = Number(req.headers['content-length'] ?? 0);
      if (length > 16_384) {
        respond(res, 413, { error: 'Request body exceeds 16 KiB' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = await body(req);
      } catch (error) {
        respond(res, error instanceof RangeError ? 413 : 400, {
          error: 'Invalid request body',
        });
        return;
      }
      // SDK v1 getters include undefined while Transport's optional fields don't under
      // exactOptionalPropertyTypes. This is the SDK's own conforming transport.
      await mcp.connect(transport as Transport);
      await transport.handleRequest(req, res, parsed);
    } finally {
      if (res.writableEnded || res.destroyed) dispose();
    }
  }

  async function close(): Promise<void> {
    closing = true;
    const timer = setTimeout(() => {
      server.closeAllConnections();
    }, 5000);
    timer.unref();
    try {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
      await Promise.all([...active].map((mcp) => mcp.close()));
    } finally {
      clearTimeout(timer);
    }
  }
  return { server, close };
}

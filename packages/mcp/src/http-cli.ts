// `gyral-mcp http`: the public, read-only Streamable HTTP server (0.3.2 shipped it as a second
// bin, `gyral-mcp-http`). TLS terminates at a trusted proxy. Host/Origin policy uses the
// explicit public origin. Configured by environment only; `gyral-mcp http --help` lists it.
import { loadCorpus } from './corpus.js';
import { createHttpServer } from './http.js';

export async function serveHttp(env: NodeJS.ProcessEnv): Promise<void> {
  const publicOrigin = env['GYRAL_MCP_PUBLIC_ORIGIN'];
  if (publicOrigin === undefined || publicOrigin === '')
    throw new Error('Set GYRAL_MCP_PUBLIC_ORIGIN (see `gyral-mcp http --help`)');
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const corpus = await loadCorpus();
  const app = createHttpServer(corpus, {
    publicOrigin,
    allowedOrigins: (env['GYRAL_MCP_ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean),
    maxConcurrent: Number(env['GYRAL_MCP_MAX_CONCURRENT'] ?? 32),
    requestsPerMinute: Number(env['GYRAL_MCP_REQUESTS_PER_MINUTE'] ?? 600),
  });
  app.server.listen(port, env['GYRAL_MCP_BIND'] ?? '127.0.0.1', () => {
    console.error(`[gyral-mcp] public HTTP ready; corpus ${corpus.version}`);
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    });
  }
}

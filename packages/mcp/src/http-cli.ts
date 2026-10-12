#!/usr/bin/env node
// TLS terminates at a trusted proxy. Host/Origin policy uses the explicit public origin.
import { loadCorpus } from './corpus.js';
import { createHttpServer } from './http.js';

const publicOrigin = process.env.GYRAL_MCP_PUBLIC_ORIGIN;
if (publicOrigin === undefined) throw new Error('Set GYRAL_MCP_PUBLIC_ORIGIN');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const corpus = await loadCorpus();
const app = createHttpServer(corpus, {
  publicOrigin,
  allowedOrigins: (process.env.GYRAL_MCP_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  maxConcurrent: Number(process.env.GYRAL_MCP_MAX_CONCURRENT ?? 32),
  requestsPerMinute: Number(process.env.GYRAL_MCP_REQUESTS_PER_MINUTE ?? 600),
});
app.server.listen(port, process.env.GYRAL_MCP_BIND ?? '127.0.0.1', () => {
  console.error(`[gyral-mcp] public HTTP ready; corpus ${corpus.version}`);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}

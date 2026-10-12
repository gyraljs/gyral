// `gyral-mcp` (no arguments): the Gyral MCP server on stdio. Logs go to stderr; stdout is the protocol.
//   GYRAL_PROJECT_DIR  where check_snippet finds TypeScript and @gyral/* (default: cwd)
//   GYRAL_DOCS_URL     refresh the docs from a live llms-full.txt at startup (falls back silently)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadCorpus, refreshDocs } from './corpus.js';
import { createServer } from './server.js';

export async function serveStdio(env: NodeJS.ProcessEnv): Promise<void> {
  let corpus = await loadCorpus();
  const docsUrl = env['GYRAL_DOCS_URL'];
  if (docsUrl !== undefined && docsUrl !== '') {
    const refreshed = await refreshDocs(corpus, docsUrl);
    corpus = refreshed.corpus;
    console.error(`[gyral-mcp] ${refreshed.note}`);
  }

  const projectDir = env['GYRAL_PROJECT_DIR'] ?? process.cwd();
  const server = createServer(corpus, { projectDir });
  await server.connect(new StdioServerTransport());
  console.error(`[gyral-mcp] Gyral ${corpus.version} docs ready (project: ${projectDir})`);
}

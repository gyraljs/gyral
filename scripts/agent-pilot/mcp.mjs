import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMAGE, sandbox } from './sandbox.mjs';

export async function connectMcp(corpus, workspace) {
  const require = createRequire(join(resolve(corpus), 'mcp/package.json'));
  const { Client } = await import(
    pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href
  );
  const client = new Client({ name: 'gyral-agent-pilot', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'docker',
    args: [
      ...sandbox(corpus, workspace, 'gyral'),
      '--interactive',
      '--mount',
      `type=bind,src=${join(resolve(corpus), 'mcp')},dst=/mcp,readonly`,
      '--env',
      'GYRAL_PROJECT_DIR=/app',
      IMAGE,
      'node',
      '/mcp/node_modules/@gyral/mcp/dist/cli.js',
    ],
    env: { PATH: process.env.PATH },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close();
    throw error;
  }
  const listed = await client.listTools();
  const definitions = listed.tools.map((entry) => ({
    type: 'function',
    function: {
      name: `mcp_${entry.name}`,
      description: entry.description,
      parameters: entry.inputSchema,
    },
  }));
  return {
    definitions,
    call: (name, args, remainingMs = 60000) =>
      client.callTool({ name, arguments: args }, undefined, {
        timeout: Math.max(1, Math.min(60000, remainingMs)),
      }),
    close: () => client.close(),
  };
}

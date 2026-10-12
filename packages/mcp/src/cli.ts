#!/usr/bin/env node
// `gyral-mcp`, the package's only bin, so `npx -y @gyral/mcp` resolves it (npx needs one bin
// or a bin named `mcp`). With no arguments it serves MCP on stdio, as it always has:
// logs go to stderr; stdout is the protocol. `gyral-mcp http` serves public Streamable HTTP.
// `gyral-mcp --help` lists both modes and their environment variables.
import { parseArgs } from './cli-args.js';

const command = parseArgs(process.argv.slice(2));
switch (command.kind) {
  case 'help':
    process.stdout.write(command.text);
    break;
  case 'error':
    console.error(`gyral-mcp: ${command.message}`);
    process.exitCode = 2;
    break;
  case 'http':
    try {
      await (await import('./http-cli.js')).serveHttp(process.env);
    } catch (error) {
      console.error(`gyral-mcp http: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    break;
  case 'stdio':
    await (await import('./stdio-cli.js')).serveStdio(process.env);
    break;
}

// The `gyral-mcp` command line: one executable, so `npx -y @gyral/mcp` always knows what to run.
// No arguments starts the stdio server; `http` starts the public Streamable HTTP server.
// Anything else is an error rather than a silent stdio start.

export type CliCommand =
  | { readonly kind: 'stdio' }
  | { readonly kind: 'http' }
  | { readonly kind: 'help'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string };

export const USAGE = `Usage: gyral-mcp [command]

The Gyral MCP server for coding agents.

Commands:
  (none)    Serve MCP over stdio for one project. This is what \`npx -y @gyral/mcp\` runs;
            point your MCP client at it. Has every tool, including check_snippet.
  http      Serve the public, read-only Streamable HTTP endpoint at /mcp (no check_snippet,
            no project paths). See \`gyral-mcp http --help\`.

Options:
  -h, --help  Show this help

Environment (stdio):
  GYRAL_PROJECT_DIR  Where check_snippet finds typescript and @gyral/* (default: cwd)
  GYRAL_DOCS_URL     Refresh the docs from a live llms-full.txt at startup (falls back to bundled)
`;

export const HTTP_USAGE = `Usage: gyral-mcp http

Serve the public, read-only Gyral MCP over stateless Streamable HTTP at /mcp, with /healthz.
Terminate TLS at a trusted proxy that preserves Host. Configured by environment only:

  GYRAL_MCP_PUBLIC_ORIGIN        Required. Exact public origin, e.g. https://mcp.gyral.dev
                                 (plain http only for loopback)
  GYRAL_MCP_BIND                 Listen address (default: 127.0.0.1)
  PORT                           Listen port (default: 3000)
  GYRAL_MCP_ALLOWED_ORIGINS      Comma-separated browser origins to accept (default: none)
  GYRAL_MCP_MAX_CONCURRENT       Concurrent requests (default: 32)
  GYRAL_MCP_REQUESTS_PER_MINUTE  Global request ceiling (default: 600)

Options:
  -h, --help  Show this help
`;

const isHelp = (arg: string | undefined): boolean => arg === '-h' || arg === '--help';

function unknown(arg: string, where: string): CliCommand {
  const what = arg.startsWith('-') ? 'option' : 'command';
  return {
    kind: 'error',
    message: `unknown ${what} '${arg}'${where}. Run \`gyral-mcp --help\` for usage.`,
  };
}

export function parseArgs(argv: readonly string[]): CliCommand {
  const [first, ...rest] = argv;
  if (first === undefined) return { kind: 'stdio' };
  if (isHelp(first)) {
    return rest.length === 0 ? { kind: 'help', text: USAGE } : unknown(rest[0] ?? '', '');
  }
  if (first === 'help') {
    if (rest.length === 0) return { kind: 'help', text: USAGE };
    if (rest.length === 1 && rest[0] === 'http') return { kind: 'help', text: HTTP_USAGE };
    return unknown(rest[0] ?? '', " after 'help'");
  }
  if (first === 'http') {
    const [next, ...more] = rest;
    if (next === undefined) return { kind: 'http' };
    if (isHelp(next) && more.length === 0) return { kind: 'help', text: HTTP_USAGE };
    return {
      kind: 'error',
      message:
        `unknown ${next.startsWith('-') ? 'option' : 'argument'} '${next}' for 'http'. ` +
        'It is configured by environment variables; run `gyral-mcp http --help`.',
    };
  }
  return unknown(first, '');
}

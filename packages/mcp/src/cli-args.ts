// The `gyral-mcp` command line: one executable, so `npx -y @gyral/mcp` always knows what to run.
// No arguments starts the stdio server; `http` starts the public Streamable HTTP server; `skill`
// writes or checks the app's copy of the Gyral skill. Anything else is an error rather than a
// silent stdio start.

export type CliCommand =
  | { readonly kind: 'stdio' }
  | { readonly kind: 'http' }
  | { readonly kind: 'skill'; readonly check: boolean; readonly dirs: readonly string[] }
  | { readonly kind: 'help'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string };

export const USAGE = `Usage: gyral-mcp [command]

The Gyral MCP server for coding agents.

Commands:
  (none)    Serve MCP over stdio for one project. This is what \`npx -y @gyral/mcp\` runs;
            point your MCP client at it. Has every tool, including check_snippet.
  http      Serve the public, read-only Streamable HTTP endpoint at /mcp (no check_snippet,
            no project paths). See \`gyral-mcp http --help\`.
  skill     Write the Gyral skill for this app's @gyral/core version to .claude/skills/gyral
            (and .agents/skills/gyral when it exists); --check fails when a copy differs.
            See \`gyral-mcp skill --help\`.

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

export const SKILL_USAGE = `Usage: gyral-mcp skill [--check] [--dir <folder>]...

Write the Gyral skill (SKILL.md and its references) into this app's agent folders, for the
@gyral/core version the app has installed: run \`npx @gyral/mcp@<that version> skill\`. Files in
those folders that the skill no longer has are removed.

Options:
  --check         Write nothing; exit 1 when a folder's copy differs (for CI)
  --dir <folder>  A folder to keep, absolute or relative to the app (repeatable).
                  Default: .claude/skills/gyral, and .agents/skills/gyral when it exists
  -h, --help      Show this help
`;

const isHelp = (arg: string | undefined): boolean => arg === '-h' || arg === '--help';

function skillArgs(rest: readonly string[]): CliCommand {
  if (rest.length === 1 && isHelp(rest[0])) return { kind: 'help', text: SKILL_USAGE };
  let check = false;
  const dirs: string[] = [];
  for (let k = 0; k < rest.length; k++) {
    const arg = rest[k];
    if (arg === '--check') check = true;
    else if (arg === '--dir' && rest[k + 1] !== undefined && !(rest[k + 1] ?? '').startsWith('-')) {
      dirs.push(rest[k + 1] ?? '');
      k++;
    } else {
      return {
        kind: 'error',
        message: `unknown option '${arg ?? ''}' for 'skill'. Run \`gyral-mcp skill --help\`.`,
      };
    }
  }
  return { kind: 'skill', check, dirs };
}

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
    if (rest.length === 1 && rest[0] === 'skill') return { kind: 'help', text: SKILL_USAGE };
    return unknown(rest[0] ?? '', " after 'help'");
  }
  if (first === 'skill') return skillArgs(rest);
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

// The `gyral-mcp` command line. One bin with subcommands (0.3.2's second bin broke `npx -y @gyral/mcp`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HTTP_USAGE, parseArgs, USAGE } from '../src/cli-args.js';

describe('gyral-mcp arguments', () => {
  it('starts stdio with no arguments, as every MCP client config runs it', () => {
    expect(parseArgs([])).toEqual({ kind: 'stdio' });
  });

  it('starts the HTTP server with `http`', () => {
    expect(parseArgs(['http'])).toEqual({ kind: 'http' });
  });

  it('prints help for both modes', () => {
    for (const argv of [['--help'], ['-h'], ['help']])
      expect(parseArgs(argv)).toEqual({ kind: 'help', text: USAGE });
    for (const argv of [
      ['http', '--help'],
      ['http', '-h'],
      ['help', 'http'],
    ])
      expect(parseArgs(argv)).toEqual({ kind: 'help', text: HTTP_USAGE });
    expect(USAGE).toContain('npx -y @gyral/mcp');
    expect(USAGE).toMatch(/^ {2}http +/m);
    for (const name of [
      'GYRAL_MCP_PUBLIC_ORIGIN',
      'GYRAL_MCP_BIND',
      'PORT',
      'GYRAL_MCP_ALLOWED_ORIGINS',
      'GYRAL_MCP_MAX_CONCURRENT',
      'GYRAL_MCP_REQUESTS_PER_MINUTE',
    ])
      expect(HTTP_USAGE).toContain(name);
  });

  it('rejects unknown commands and options instead of silently starting stdio', () => {
    for (const argv of [
      ['serve'],
      ['--port', '3000'],
      ['-x'],
      ['--help', 'extra'],
      ['help', 'nope'],
      ['http', '--port=3000'],
      ['http', 'extra'],
      ['http', '--help', 'extra'],
      ['gyral-mcp-http'],
    ]) {
      const parsed = parseArgs(argv);
      expect(parsed.kind, argv.join(' ')).toBe('error');
      if (parsed.kind === 'error') expect(parsed.message).toMatch(/gyral-mcp (http )?--help/);
    }
    expect(parseArgs(['serve'])).toMatchObject({
      message: expect.stringContaining("command 'serve'") as unknown,
    });
    expect(parseArgs(['-x'])).toMatchObject({
      message: expect.stringContaining("option '-x'") as unknown,
    });
  });

  it('ships exactly one bin, so `npx @gyral/mcp` can pick it', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { bin: Record<string, string> };
    expect(manifest.bin).toEqual({ 'gyral-mcp': './dist/cli.js' });
  });
});

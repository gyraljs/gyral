// The built server over stdio, driven by the official MCP client: what an agent actually sees.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer as reserveServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const client = new Client({ name: 'gyral-mcp-test', version: '0.0.0' });

beforeAll(async () => {
  const build = spawnSync('pnpm', ['run', 'build'], { cwd: pkgDir, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [cli],
      env: { PATH: process.env.PATH ?? '', GYRAL_PROJECT_DIR: pkgDir },
      stderr: 'ignore',
    }),
  );
}, 120_000);

afterAll(async () => {
  await client.close();
});

type Content = readonly { readonly type: string; readonly text?: string }[];

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Content;
  return { text: content.map((c) => c.text ?? '').join('\n'), isError: result.isError === true };
}

describe('gyral MCP server over stdio', () => {
  it('lists the tools with input schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_snippet',
      'get_api',
      'get_doc',
      'get_example',
      'list_examples',
      'scaffold_component',
      'search_docs',
      'start_here',
    ]);
    const search = tools.find((t) => t.name === 'search_docs');
    expect(search?.inputSchema.required).toEqual(['query']);
    expect(client.getInstructions()).toContain('Model-View-Intent');
    expect(client.getInstructions()).toContain('start_here');
  });

  it('puts the workflow in every tool description, for clients that drop instructions', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, tool.name).toContain('start_here');
      expect(tool.description, tool.name).toMatch(/get_example or scaffold_component/);
      expect(tool.description, tool.name).toContain('check_snippet');
      expect(tool.description, tool.name).toMatch(/get_api only/);
    }
    const scaffold = tools.find((t) => t.name === 'scaffold_component');
    expect(Object.keys(scaffold?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['project_dir', 'installed']),
    );
    const getDoc = tools.find((t) => t.name === 'get_doc');
    expect(Object.keys(getDoc?.inputSchema.properties ?? {})).toEqual(['path_or_url', 'path']);
  });

  it('orients an agent with start_here', async () => {
    const { text } = await call('start_here');
    expect(text).toContain('## Workflow');
    expect(text).toContain('get_example "register"');
    expect(text).toContain('check_snippet');
  });

  it('answers every tool', async () => {
    expect((await call('search_docs', { query: 'lazy hydration', limit: 2 })).text).toContain(
      'https://gyral.dev/docs/server-rendering/#lazy-hydration',
    );
    expect((await call('get_doc', { path_or_url: 'forms#the-server-half' })).text).toContain(
      'formAction',
    );
    // `path` is accepted too: agents guess it.
    expect(await call('get_doc', { path: 'forms#the-server-half' })).toMatchObject({
      isError: false,
      text: expect.stringContaining('formAction') as unknown,
    });
    expect((await call('get_doc', {})).isError).toBe(true);
    expect((await call('get_api', { symbol: 'Reducer' })).text).toContain(
      "import { type Reducer } from '@gyral/core';",
    );
    expect((await call('get_api', { symbol: 'renderPage' })).text).toContain(
      "import { renderPage } from '@gyral/ssr';",
    );
    expect((await call('list_examples')).text).toContain('**hello-world**');
    expect((await call('get_example', { name: 'hello-world' })).text).toContain('src/hello.ts');
    expect((await call('scaffold_component', { tag: 'todo-list', kind: 'basic' })).text).toContain(
      "define<State, Msg>()('todo-list'",
    );
    const check = await call('check_snippet', {
      code: "import { define, html } from '@gyral/core';\nexport const X = define<{ readonly n: number }, never>()('x-y', { init: () => ({ n: 0 }), intent: {}, update: {}, view: (s) => html`${s.n}` });\n",
    });
    expect(check).toEqual({
      text: expect.stringMatching(/^No type errors/) as unknown,
      isError: false,
    });
    const fixes = await call('check_snippet', {
      code: "import { define, html } from '@gyral/core';\nexport const X = define<{ readonly n: number }, never>('x-y', { init: () => ({ n: 0 }), view: (s) => html`${s.n}` });\n",
    });
    expect(fixes.isError).toBe(false);
    expect(fixes.text).toContain('Suggested fixes:');
    expect(fixes.text).toContain("define<State, Msg>()('my-tag'");
  }, 60_000);

  it('scaffolds for what the project has installed', async () => {
    // GYRAL_PROJECT_DIR is this package: @gyral/core, http, ssr, testing and zod, no vitest.
    const plain = await call('scaffold_component', { tag: 'my-count', kind: 'basic' });
    expect(plain.text).not.toContain('my-count.test.ts');
    expect(plain.text).toContain('lacks @gyral/testing or vitest');
    const tested = await call('scaffold_component', {
      tag: 'my-count',
      kind: 'basic',
      installed: ['vitest'],
    });
    expect(tested.text).toContain('src/my-count.test.ts');
    const form = await call('scaffold_component', { tag: 'my-form', kind: 'form' });
    expect(form.text).toContain("import { z } from 'zod';");
    expect(form.text).toContain("import { submitForm } from '@gyral/http';");
    const native = await call('scaffold_component', { tag: 'my-form', kind: 'form-native' });
    expect(native.text).toContain('novalidate');
    expect(native.text).not.toMatch(/from '(?:zod|valibot|@gyral\/http)'/);
    const missing = await call('scaffold_component', {
      tag: 'my-form',
      kind: 'form',
      project_dir: 'no-such-dir',
    });
    // No package.json there: the nearest one above it is this package's.
    expect(missing.isError).toBe(false);
  });

  it('reports bad input as tool errors, not crashes', async () => {
    expect(await call('get_api', { symbol: 'renderPge' })).toMatchObject({
      isError: true,
      text: expect.stringContaining('renderPage') as unknown,
    });
    expect((await call('scaffold_component', { tag: 'Bad', kind: 'basic' })).isError).toBe(true);
    expect((await call('get_example', { name: 'nope' })).isError).toBe(true);
  });

  it('serves llms.txt, the skill and its references, and the prompt', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        'gyral://llms.txt',
        'gyral://skill',
        'gyral://skill/references/forms.md',
      ]),
    );
    const llms = await client.readResource({ uri: 'gyral://llms.txt' });
    expect(JSON.stringify(llms.contents)).toContain('# Gyral');
    const forms = await client.readResource({ uri: 'gyral://skill/references/forms.md' });
    expect(JSON.stringify(forms.contents)).toContain('formAction');
    const prompt = await client.getPrompt({
      name: 'build-gyral-component',
      arguments: { tag: 'todo-list', description: 'A todo list' },
    });
    expect(JSON.stringify(prompt.messages)).toContain('Golden rules');
  });
});

describe('the gyral-mcp command line', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input: '', timeout: 30_000 });

  it('prints help for both modes and exits 0', () => {
    const help = run('--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: gyral-mcp [command]');
    expect(help.stdout).toMatch(/^ {2}http +/m);
    const http = run('http', '--help');
    expect(http.status).toBe(0);
    expect(http.stdout).toContain('GYRAL_MCP_PUBLIC_ORIGIN');
  });

  it('exits 2 with a clear message for unknown commands and flags', () => {
    for (const args of [['serve'], ['--port', '3000'], ['http', '--port', '3000']]) {
      const result = run(...args);
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^gyral-mcp: unknown (command|option)/);
    }
  });

  it('`http` without a public origin fails with a message, not a stack trace', () => {
    const result = spawnSync(process.execPath, [cli, 'http'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
      timeout: 30_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(
      'gyral-mcp http: Set GYRAL_MCP_PUBLIC_ORIGIN (see `gyral-mcp http --help`)',
    );
  });

  it('`http` serves /healthz and stops on SIGTERM', async () => {
    const reservation = reserveServer().listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (address === null || typeof address === 'string') throw new Error('Missing address');
    await new Promise((resolve) => reservation.close(resolve));
    const origin = `http://127.0.0.1:${String(address.port)}`;
    const child = spawn(process.execPath, [cli, 'http'], {
      env: {
        PATH: process.env.PATH ?? '',
        PORT: String(address.port),
        GYRAL_MCP_PUBLIC_ORIGIN: origin,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    try {
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => (stderr += chunk));
      await vi.waitUntil(() => stderr.includes('public HTTP ready'), { timeout: 30_000 });
      const health = (await (await fetch(`${origin}/healthz`)).json()) as { version: string };
      expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code] = (await exited) as [number | null];
      expect(code).toBe(0);
    }
  }, 60_000);
});

// The built server over stdio, driven by the official MCP client: what an agent actually sees.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));
const client = new Client({ name: 'gyral-mcp-test', version: '0.0.0' });

beforeAll(async () => {
  const build = spawnSync('pnpm', ['run', 'build'], { cwd: pkgDir, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url))],
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
    ]);
    const search = tools.find((t) => t.name === 'search_docs');
    expect(search?.inputSchema.required).toEqual(['query']);
    expect(client.getInstructions()).toContain('Model-View-Intent');
  });

  it('answers every tool', async () => {
    expect((await call('search_docs', { query: 'lazy hydration', limit: 2 })).text).toContain(
      'https://gyral.dev/docs/server-rendering/#lazy-hydration',
    );
    expect((await call('get_doc', { path_or_url: 'forms#the-server-half' })).text).toContain(
      'formAction',
    );
    expect((await call('get_api', { symbol: 'renderPage' })).text).toContain(
      "import { renderPage } from '@gyral/ssr';",
    );
    expect((await call('list_examples')).text).toContain('**counter**');
    expect((await call('get_example', { name: 'counter' })).text).toContain('src/counter.ts');
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
  }, 60_000);

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

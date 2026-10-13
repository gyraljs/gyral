import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ordering } from '../agent-pilot/prompts.mjs';
import { createTools, safePath } from '../agent-pilot/tools.mjs';
import { LIMITS, requestBody, usageSummary } from '../agent-pilot/provider.mjs';
import { trial } from '../agent-pilot/agent.mjs';
import {
  FRAMEWORKS,
  GENERATED_DIR,
  fixtureSource,
  hashes,
  save,
  workspace,
} from '../agent-pilot/corpus.mjs';
import { criteria, conditionMetrics, report } from '../agent-pilot/report.mjs';
import { getDoc, listDocs, parseIndex, searchDocs, sections } from '../agent-pilot/docs.mjs';
import { compact, POLICY } from '../agent-pilot/context.mjs';
import { bridge } from '../agent-pilot/mcp.mjs';
import { classify } from '../agent-pilot/grader.mjs';
import { sandboxArgs } from '../agent-pilot/sandbox.mjs';
import { mockComplete } from '../agent-pilot/mock.mjs';

const directories = [];
const temporary = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-pilot-test-'));
  directories.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('agent pilot isolation and evidence', () => {
  it('keeps report evidence links valid when a failed build has no screenshot or earlier batch', () => {
    const root = temporary();
    const plan = {
      runs: [{ id: 'failed-build' }],
      model: 'fake',
      endpoint: 'https://example.invalid',
    };
    save(join(root, 'plan.json'), plan);
    mkdirSync(join(root, 'failed-build/final'), { recursive: true });
    save(join(root, 'failed-build/result.json'), {
      id: 'failed-build',
      condition: 'react-docs',
      task: 'bug',
      passed: false,
      reason: 'request_limit',
      toolCalls: 1,
      repairAttempts: 0,
      agentElapsedMs: 1,
      usage: { totalTokens: 1 },
    });
    for (const file of [
      'failed-build/changes.patch',
      'failed-build/transcript.json',
      'failed-build/final/grade.json',
    ])
      writeFileSync(join(root, file), '');
    report(root, plan);
    for (const file of ['report.html', 'initial-attempts.html']) {
      const html = readFileSync(join(root, file), 'utf8');
      for (const match of html.matchAll(/href="([^"]+)"/g))
        expect(existsSync(join(root, match[1])), `${file}: ${match[1]}`).toBe(true);
    }
    expect(readFileSync(join(root, 'report.html'), 'utf8')).toContain('No browser screenshot');
  });
  it('balances every trial block and uses a reproducible shuffled order', () => {
    const runs = ordering();
    expect(runs).toEqual(ordering());
    expect(new Set(runs.map((run) => run.id)).size).toBe(36);
    for (const trial of [1, 2, 3])
      expect(
        new Set(
          runs.filter((run) => run.trial === trial).map((run) => `${run.condition}/${run.task}`),
        ).size,
      ).toBe(12);
  });
  it('rejects path traversal, config writes, absolute paths and symlink escapes', () => {
    const root = temporary();
    mkdirSync(join(root, 'src'));
    symlinkSync(tmpdir(), join(root, 'src/escape'));
    for (const path of [
      '../secret',
      '/etc/passwd',
      'src/../secret',
      'src\\secret',
      'package.json',
      'src/escape/secret.ts',
    ])
      expect(() => safePath(root, path, true)).toThrow();
    expect(safePath(root, 'src/new.ts', true)).toBe(join(root, 'src/new.ts'));
  });
  it('uses prior provider token counts to avoid premature context refusal', () => {
    expect(() =>
      requestBody('Qwen3.8-27B', [{ role: 'user', content: 'x'.repeat(LIMITS.contextTokens) }], []),
    ).toThrow('context_limit');
    const history = [{ role: 'user', content: 'x'.repeat(300000) }];
    expect(() =>
      requestBody('Qwen3.8-27B', history, [], { messageCount: 1, promptTokens: 60000 }),
    ).not.toThrow();
    expect(() =>
      requestBody('Qwen3.8-27B', [...history, { role: 'tool', content: 'x'.repeat(75000) }], [], {
        messageCount: 1,
        promptTokens: 60000,
      }),
    ).toThrow('context_limit');
    expect(usageSummary([{ ok: false, data: { error: 'outage' } }]).totalTokens).toBeNull();
    expect(
      usageSummary([
        { ok: true, data: { usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } } },
      ]).totalTokens,
    ).toBe(8);
  });
  it('keeps failed checks and counts a changed-source repair in a fake-agent dry run', async () => {
    const root = temporary();
    const corpus = join(root, 'corpus');
    mkdirSync(join(corpus, 'seeds/react/src'), { recursive: true });
    mkdirSync(join(corpus, 'docs/react'), { recursive: true });
    save(join(corpus, 'frozen.json'), {});
    save(join(corpus, 'seeds/react/package.json'), {});
    const fixed = readFileSync(
      new URL('../agent-pilot/fixtures/react/tasks.tsx.txt', import.meta.url),
      'utf8',
    ).replace('__TOGGLE_ID__', 'item.id');
    let step = 0;
    const completion = async () => {
      const calls = [
        { name: 'check', arguments: '{}' },
        { name: 'write_file', arguments: JSON.stringify({ path: 'src/App.tsx', content: fixed }) },
        { name: 'check', arguments: '{}' },
      ];
      const call = calls[step++];
      return {
        ok: true,
        data: {
          model: 'Qwen3.8-27B',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          choices: [
            {
              message: call
                ? {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{ id: `tool-${step}`, type: 'function', function: call }],
                  }
                : { role: 'assistant', content: 'Done' },
            },
          ],
        },
      };
    };
    const grading = async (corpus, app, framework, task, output) => {
      mkdirSync(output, { recursive: true });
      const passed = readFileSync(join(app, 'src/App.tsx'), 'utf8') === fixed;
      writeFileSync(join(output, 'type.log'), passed ? '' : 'Seeded failure');
      writeFileSync(join(output, 'build.log'), '');
      return {
        passed,
        infrastructure: false,
        sourceHashes: hashes(app),
        type: { code: 0 },
        build: { code: 0 },
        browser: { cases: [{ name: 'identity', passed }], pageErrors: [] },
      };
    };
    const result = await trial(
      corpus,
      join(root, 'result'),
      { id: 'fake', condition: 'react-docs', framework: 'react', task: 'bug', trial: 0 },
      { model: 'Qwen3.8-27B', baseUrl: 'https://example.invalid/v1', apiKey: 'fake-private-key' },
      { complete: completion, grade: grading },
    );
    expect(result.passed).toBe(true);
    expect(result.repairAttempts).toBe(1);
    expect(result.checks.map((check) => check.passed)).toEqual([false, true]);
    expect(result.usage.totalTokens).toBe(80);
    expect(readFileSync(join(root, 'result/transcript.json'), 'utf8')).not.toContain(
      'fake-private-key',
    );
    expect(readFileSync(join(root, 'result/changes.patch'), 'utf8')).toContain('item.id');
  });
  it('records a dispatched request that times out without inventing billable usage', async () => {
    const root = temporary();
    const corpus = join(root, 'corpus');
    mkdirSync(join(corpus, 'seeds/react/src'), { recursive: true });
    mkdirSync(join(corpus, 'docs/react'), { recursive: true });
    save(join(corpus, 'frozen.json'), {});
    save(join(corpus, 'seeds/react/package.json'), {});
    const result = await trial(
      corpus,
      join(root, 'result'),
      { id: 'fake-timeout', condition: 'react-docs', framework: 'react', task: 'bug', trial: 0 },
      { model: 'Qwen3.8-27B', baseUrl: 'https://example.invalid/v1', apiKey: 'fake-private-key' },
      {
        complete: async () => {
          throw new Error('Simulated timeout');
        },
        grade: async () => ({ passed: false, infrastructure: false }),
      },
    );
    expect(result.reason).toBe('provider_failure');
    expect(result.infrastructure).toBe(true);
    expect(result.usage.requests).toBe(1);
    expect(result.usage.totalTokens).toBeNull();
    const response = JSON.parse(readFileSync(join(root, 'result/response-1.json')));
    expect(response.data.error).toContain('Simulated timeout');
  });
});

const PAGES = {
  'docs/testing': `# Testing\n\nTest models without a DOM.\n\n## Testing stores\n\nStores are tested with step.\n\n## Testing components\n\nMount in a browser.\n\n\`\`\`md\n# Not a heading\n\`\`\`\n`,
  'docs/update': `# Model and update\n\nOne pure reducer per message.\n\n## Commands\n\nReducers return commands as data.\n`,
  'learn/rendering-lists': `---\ntitle: Rendering Lists\n---\n\n<Intro>\n\nUse map() and keys to render lists.\n\n</Intro>\n\n## Keeping list items in order with key {/*keeping-list-items-in-order-with-key*/}\n\nKeys identify items.\n\n${'Filler text about lists. '.repeat(700)}\n\n## Rules of keys\n\nKeys must be unique.\n`,
};

/** A minimal frozen corpus whose docs follow the protocol v3 layout. */
function fakeCorpus(root, framework = 'react') {
  const corpus = join(root, 'corpus');
  mkdirSync(join(corpus, `seeds/${framework}/src`), { recursive: true });
  save(join(corpus, 'frozen.json'), {});
  save(join(corpus, `seeds/${framework}/package.json`), {});
  for (const dir of [framework, 'skill']) {
    const docs = join(corpus, 'docs', dir);
    mkdirSync(join(docs, 'pages'), { recursive: true });
    const pages = Object.entries(PAGES).map(([id, text], index) => {
      const file = `pages/${id.replaceAll('/', '__')}.md`;
      writeFileSync(join(docs, file), text);
      return {
        id: dir === 'skill' ? `skill/${id}` : id,
        title: ['Testing', 'Model and update', 'Rendering Lists'][index],
        group: dir === 'skill' ? 'Released Gyral skill' : 'Docs',
        description: '',
        url: `https://example.invalid/${id}.md`,
        file,
      };
    });
    save(join(docs, 'sources.json'), { summary: 'A framework.', pages });
  }
  writeFileSync(join(corpus, 'docs/skill/SKILL.md'), '# Skill\n');
  return corpus;
}

const toolCall = (id, name, args) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const answer = (message) => ({
  ok: true,
  data: {
    model: 'Qwen3.8-27B',
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    choices: [{ message }],
  },
});
const CONFIG = {
  model: 'Qwen3.8-27B',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'fake-private-key',
};

describe('protocol v3 documentation tools (H1/H2)', () => {
  it('parses an llms.txt index with groups, descriptions and Markdown or text links', () => {
    const index = parseIndex(
      '# Lib\n\n> Summary line.\n\n## Docs\n\n- [Agents](https://x.dev/llms-small.txt): Read first.\n- [Intro](https://x.dev/docs/intro/index.md): Start here.\n- [Brand](https://x.dev/brand/): HTML only\n\n### API\n\n- [core](https://x.dev/api/core.md)\n',
    );
    expect(index.summary).toBe('Summary line.');
    expect(index.entries).toEqual([
      {
        title: 'Agents',
        url: 'https://x.dev/llms-small.txt',
        description: 'Read first.',
        group: 'Docs',
      },
      {
        title: 'Intro',
        url: 'https://x.dev/docs/intro/index.md',
        description: 'Start here.',
        group: 'Docs',
      },
      { title: 'core', url: 'https://x.dev/api/core.md', description: '', group: 'Docs › API' },
    ]);
  });

  it('resolves exact headings before prefixes and ignores headings in code', () => {
    const root = temporary();
    const corpus = fakeCorpus(root);
    const library = createTools(
      corpus,
      root,
      { framework: 'react', condition: 'react-docs' },
      root,
    ).library;
    expect(sections(PAGES['docs/testing']).map((entry) => entry.heading)).toEqual([
      'Testing',
      'Testing stores',
      'Testing components',
    ]);
    const testing = getDoc(library, 'docs/testing', '# Testing');
    expect(testing.section).toBe('Testing');
    expect(testing.matched).toBeUndefined();
    expect(testing.text).toContain('Testing components');
    expect(getDoc(library, 'docs/testing', 'testing stores').text).toBe(
      '## Testing stores\n\nStores are tested with step.\n\n',
    );
    // "Update" finds the page titled "Model and update", by page and by section.
    expect(getDoc(library, 'Update').closest).toEqual(['docs/update']);
    expect(getDoc(library, 'docs/update', 'Update').matched).toContain('Model and update');
    const missing = getDoc(library, 'docs/update', 'Routing');
    expect(missing.error).toContain('No section');
    expect(missing.outline).toEqual(['# Model and update', '## Commands']);
  });

  it('truncates long pages with an outline and ranks heading matches first', () => {
    const root = temporary();
    const library = createTools(
      fakeCorpus(root),
      root,
      { framework: 'react', condition: 'react-docs' },
      root,
    ).library;
    const page = getDoc(library, 'learn/rendering-lists');
    expect(page.truncated).toBe(true);
    expect(page.text.length).toBeLessThanOrEqual(12000);
    expect(page.outline).toContain('## Rules of keys');
    expect(getDoc(library, 'learn/rendering-lists', 'Rules of keys').text).toContain('unique');
    const found = searchDocs(library, 'testing stores');
    expect(found.results[0]).toMatchObject({ page: 'docs/testing', section: 'Testing stores' });
    expect(searchDocs(library, 'keys').results[0].section).toContain('key');
    expect(listDocs(library).pages[0]).toBe('docs/testing | Testing (Docs)');
  });

  it('warns on repeated reads by resolved content, and gives the assisted condition the skill', async () => {
    const root = temporary();
    const corpus = fakeCorpus(root);
    const tools = createTools(corpus, root, { framework: 'react', condition: 'react-docs' }, root);
    tools.setRequest(1);
    expect((await tools.execute('get_doc', { page: 'docs/testing' })).warning).toBeUndefined();
    tools.setRequest(2);
    const again = await tools.execute('get_doc', { page: 'docs/testing', section: 'Testing' });
    expect(again.warning).toContain('request 1');
    expect(
      (await tools.execute('search_docs', { query: 'Stores testing' })).warning,
    ).toBeUndefined();
    expect((await tools.execute('search_docs', { query: 'testing stores' })).warning).toBeDefined();
    expect(tools.accesses.filter((entry) => entry.repeat)).toHaveLength(2);
    await expect(tools.execute('read_doc', { path: 'x' })).rejects.toThrow('Unknown tool');
    const assisted = createTools(
      fakeCorpus(temporary(), 'gyral'),
      root,
      { framework: 'gyral', condition: 'gyral-assisted' },
      root,
    );
    expect(assisted.library.pages.map((page) => page.id)).toContain('skill/docs/testing');
  });
});

describe('protocol v3 agent loop (H3/H4)', () => {
  it('shows the budget, compacts old output and checkpoints at half budget in every condition', async () => {
    for (const [framework, condition] of [
      ['react', 'react-docs'],
      ['gyral', 'gyral-docs'],
    ]) {
      const root = temporary();
      const corpus = fakeCorpus(root, framework);
      let step = 0;
      const completion = async () => {
        step++;
        if (step > 14) return answer({ role: 'assistant', content: 'Stopping' });
        return answer({
          role: 'assistant',
          content: null,
          tool_calls: [toolCall(`call-${step}`, 'get_doc', { page: 'learn/rendering-lists' })],
        });
      };
      const result = await trial(
        corpus,
        join(root, 'result'),
        { id: 'loop', condition, framework, task: 'feature', trial: 0 },
        CONFIG,
        {
          complete: completion,
          grade: async () => ({ passed: false, infrastructure: false }),
          connectMcp: async () => {
            throw new Error('not used');
          },
        },
      );
      expect(result.checkpointAfterRequest).toBe(POLICY.checkpointAfterRequest);
      expect(result.firstWriteRequest).toBeNull();
      expect(result.docCalls).toBe(14);
      expect(result.repeatReads).toBe(13);
      const transcript = JSON.parse(readFileSync(join(root, 'result/transcript.json')));
      const tools = transcript.messages.filter((message) => message.role === 'tool');
      expect(JSON.parse(tools[0].content).budget).toBe('Model request 1 of 24 used; 23 remaining.');
      expect(tools.every((message) => !message.content.includes('omitted to save context'))).toBe(
        true,
      );
      const checkpoints = transcript.messages.filter(
        (message) => message.role === 'user' && message.content.startsWith('Checkpoint:'),
      );
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].content).toContain('12 of 24');
      const sent = JSON.parse(readFileSync(join(root, 'result/request-14.json'))).messages;
      const sentTools = sent.filter((message) => message.role === 'tool');
      expect(sentTools.slice(0, -4).every((message) => message.content.includes('omitted'))).toBe(
        true,
      );
      expect(sentTools.slice(-4).some((message) => message.content.includes('omitted'))).toBe(
        false,
      );
      const assistants = transcript.messages
        .map((message, index) => (message.role === 'assistant' ? index : -1))
        .filter((index) => index >= 0);
      expect(sent).toHaveLength(assistants[13]);
    }
  });

  it('compacts deterministically and keeps the message count', () => {
    const meta = new Map();
    const messages = [{ role: 'user', content: 'task' }];
    for (let index = 1; index <= 6; index++) {
      meta.set(`t${index}`, {
        name: 'get_doc',
        request: index,
        budget: `b${index}`,
        summary: 'S.',
      });
      messages.push({
        role: 'tool',
        tool_call_id: `t${index}`,
        content: 'x'.repeat(index === 2 ? 10 : 700),
      });
    }
    const first = compact(messages, meta);
    expect(first).toEqual(compact(messages, meta));
    expect(first.messages).toHaveLength(messages.length);
    expect(first.stubbed).toBe(1);
    expect(first.messages[2].content).toBe('x'.repeat(10));
    expect(JSON.parse(first.messages[1].content)).toEqual({
      budget: 'b1',
      compacted:
        'Output of get_doc from request 1 omitted to save context (700 characters). S. Call the tool again if you need the full output.',
    });
  });
});

describe('protocol v3 MCP bridge (H5)', () => {
  it('forwards instructions, tools, prompts and resources from the real packages/mcp server', async () => {
    const mcpRequire = createRequire(new URL('../../packages/mcp/package.json', import.meta.url));
    const load = (name) => import(pathToFileURL(mcpRequire.resolve(name)).href);
    const { Client } = await load('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await load('@modelcontextprotocol/sdk/inMemory.js');
    const { createServer } = await import('../../packages/mcp/src/server.ts');
    const { buildCorpus } = await import('../../packages/mcp/scripts/build-corpus.mjs');
    const { parseLlmsFull } = await import('../../packages/mcp/src/docs.ts');
    const server = createServer(buildCorpus(parseLlmsFull), {
      projectDir: new URL('../../packages/mcp', import.meta.url).pathname,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'pilot-test', version: '0.0.0' });
    await client.connect(clientSide);
    const mcp = await bridge(client);
    try {
      expect(mcp.instructions).toContain('gyral://skill');
      expect(mcp.prompts).toContain('build-gyral-component');
      expect(mcp.resources).toEqual(
        expect.arrayContaining([
          'gyral://llms.txt',
          'gyral://skill',
          'gyral://skill/references/{name}',
        ]),
      );
      const names = mcp.definitions.map((entry) => entry.function.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'mcp_scaffold_component',
          'mcp_check_snippet',
          'mcp_get_prompt',
          'mcp_read_resource',
        ]),
      );
      const prompt = await mcp.call('get_prompt', {
        name: 'build-gyral-component',
        arguments: { tag: 'pilot-app', description: 'A task list' },
      });
      expect(prompt.messages[0].text).toContain('scaffold_component');
      const skill = await mcp.call('read_resource', { uri: 'gyral://skill' });
      expect(skill.contents[0].text).toContain('Gyral');
      const reference = await mcp.call('read_resource', {
        uri: 'gyral://skill/references/view.md',
      });
      expect(reference.contents[0].text.length).toBeGreaterThan(100);
      const searched = await mcp.call('search_docs', { query: 'keyed list', limit: 1 });
      expect(searched.content[0].text).toContain('gyral.dev');

      // The assisted trial puts the server instructions in the system prompt and routes calls.
      const root = temporary();
      let step = 0;
      const result = await trial(
        fakeCorpus(root, 'gyral'),
        join(root, 'result'),
        { id: 'mcp', condition: 'gyral-assisted', framework: 'gyral', task: 'feature', trial: 0 },
        CONFIG,
        {
          connectMcp: async () => ({ ...mcp, close: async () => {} }),
          grade: async () => ({ passed: false, infrastructure: false }),
          complete: async () =>
            answer(
              step++ === 0
                ? {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      toolCall('p', 'mcp_get_prompt', {
                        name: 'build-gyral-component',
                        arguments: { tag: 'pilot-app', description: 'x' },
                      }),
                      toolCall('r', 'mcp_read_resource', { uri: 'gyral://skill' }),
                    ],
                  }
                : { role: 'assistant', content: 'Done' },
            ),
        },
      );
      const transcript = JSON.parse(readFileSync(join(root, 'result/transcript.json')));
      expect(transcript.messages[0].content).toContain(mcp.instructions);
      expect(result.toolUse).toEqual({ mcp_get_prompt: 1, mcp_read_resource: 1 });
      expect(result.docCalls).toBe(2);
      expect(JSON.parse(transcript.messages.at(-3).content).result.messages[0].text).toContain(
        'check_snippet',
      );
    } finally {
      await client.close();
    }
  }, 60_000);
});

describe('protocol v3 sandbox and fixtures (H6/H7)', () => {
  it('mounts only isolated generated output and the build output as writable', () => {
    const args = sandboxArgs('/corpus', '/work/app', 'gyral', '/grade/generated', '1:1');
    const mounts = args.filter((_, index) => args[index - 1] === '--mount');
    expect(mounts).toEqual([
      'type=bind,src=/work/app,dst=/app,readonly',
      'type=bind,src=/corpus/seeds/gyral/node_modules,dst=/app/node_modules,readonly',
      `type=bind,src=/grade/generated,dst=/app/${GENERATED_DIR}`,
    ]);
    expect(args).toContain('--read-only');
    expect(
      classify({ code: 1, log: "EROFS: read-only file system, mkdir '/app/.gyral'" }),
    ).toMatchObject({ infrastructure: true, infrastructureReason: 'sandbox_permission' });
    expect(
      classify({ code: 2, log: "error TS2322: Type 'string'" }).infrastructure,
    ).toBeUndefined();
    const root = temporary();
    const corpus = fakeCorpus(root);
    workspace(corpus, join(root, 'app'), 'react', 'bug');
    expect(existsSync(join(root, 'app', GENERATED_DIR))).toBe(true);
    expect(Object.keys(hashes(join(root, 'app')))).not.toContain(GENERATED_DIR);
  });

  it('seeds the same single-expression identity bug in each framework idiom', () => {
    for (const framework of FRAMEWORKS) {
      const seeded = fixtureSource(framework, 'bug').split('\n');
      const fixed = fixtureSource(framework, 'bug', true).split('\n');
      expect(seeded).toHaveLength(fixed.length);
      const changed = seeded.filter((line, index) => line !== fixed[index]);
      expect(changed, framework).toHaveLength(1);
      expect(changed[0]).toMatch(/\[(index|shown\.indexOf\(item\))\]\?\.id/);
    }
    const gyral = fixtureSource('gyral', 'bug');
    expect(gyral).toContain('intentsOf<typeof App>()');
    expect(gyral).toContain('value=${item.id}');
    expect(gyral).toContain('({ value })');
    expect(gyral).not.toMatch(/data-id|data-index|getAttribute/);
  });
});

describe('protocol v3 mock provider and report', () => {
  it('drives a full scripted trial: repair on trial 1, checkpoint on trial 3', async () => {
    const outcomes = {};
    for (const trialNumber of [1, 3]) {
      const root = temporary();
      const corpus = fakeCorpus(root);
      const run = {
        id: `mock-${trialNumber}`,
        condition: 'react-docs',
        framework: 'react',
        task: 'bug',
        trial: trialNumber,
      };
      const reference = fixtureSource('react', 'bug', true);
      outcomes[trialNumber] = await trial(
        corpus,
        join(root, 'result'),
        run,
        { model: 'mock-agent', baseUrl: 'mock://scripted', apiKey: 'random-test-key' },
        {
          complete: mockComplete(run),
          grade: async (corpus, app, framework, task, output) => {
            mkdirSync(output, { recursive: true });
            writeFileSync(join(output, 'type.log'), '');
            writeFileSync(join(output, 'build.log'), '');
            const passed = readFileSync(join(app, 'src/App.tsx'), 'utf8') === reference;
            return {
              passed,
              infrastructure: false,
              type: { code: 0 },
              build: { code: 0 },
              browser: { cases: [{ name: 'filtered task identity', passed }], pageErrors: [] },
            };
          },
        },
      );
    }
    expect(outcomes[1]).toMatchObject({
      passed: true,
      reason: 'agent_finished',
      repairAttempts: 1,
      firstWriteRequest: 5,
      firstCheckRequest: 6,
      checkpointAfterRequest: null,
      repeatReads: 1,
    });
    expect(outcomes[3]).toMatchObject({
      passed: true,
      checkpointAfterRequest: 12,
      firstWriteRequest: 13,
      firstCheckRequest: 14,
    });
  });

  it('evaluates the gyral-7se.31 success criteria from run metrics', () => {
    const run = (overrides) => ({
      passed: true,
      infrastructure: false,
      firstWriteRequest: 6,
      firstCheckRequest: 7,
      docCalls: 10,
      repeatReads: 0,
      usefulMcpTools: 1,
      toolUse: {},
      ...overrides,
    });
    const metrics = {
      'gyral-docs': conditionMetrics([
        ...Array.from({ length: 7 }, () => run()),
        run({ passed: false }),
        run({ passed: false, firstWriteRequest: null }),
      ]),
      'gyral-assisted': conditionMetrics(Array.from({ length: 9 }, () => run({ repeatReads: 1 }))),
    };
    expect(criteria(metrics).map((entry) => entry.met)).toEqual([
      true,
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});

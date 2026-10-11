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
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ordering } from '../agent-pilot/prompts.mjs';
import { safePath } from '../agent-pilot/tools.mjs';
import { LIMITS, requestBody, usageSummary } from '../agent-pilot/provider.mjs';
import { trial } from '../agent-pilot/agent.mjs';
import { hashes, save } from '../agent-pilot/corpus.mjs';
import { report } from '../agent-pilot/report.mjs';

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

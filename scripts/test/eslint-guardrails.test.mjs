// Proves the ESLint guardrails in eslint.config.js fire, with their remediation messages,
// on real paths (rules are scoped by file globs, and type-aware linting needs files on disk).
// Fixtures are written next to real sources, linted with the real config, then removed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FIXTURES = {
  coreEffect: [
    'packages/core/src/__lint_fixture_effect__.ts',
    "import { Effect } from 'effect';\nexport const x = Effect.void;\n",
  ],
  internalEffect: [
    'packages/core/src/internal/__lint_fixture_effect__.ts',
    "import { Effect } from 'effect';\nexport const x = Effect.void;\n",
  ],
  coreLayer: [
    'packages/core/src/__lint_fixture_layer__.ts',
    "export { makeHttpDriver } from '@gyral/http';\n",
  ],
  layerOne: [
    'packages/http/src/__lint_fixture_layer__.ts',
    "export { routes } from '@gyral/router';\nexport { define } from '@gyral/core';\n",
  ],
  ssrLabs: [
    'packages/ssr/src/__lint_fixture_labs__.ts',
    "export { render } from '@lit-labs/ssr';\n",
  ],
  checked: [
    'packages/core/src/__lint_fixture_checked__.ts',
    [
      "import { html } from 'lit';",
      "import { liveBoolean } from './live-boolean.js';",
      'export const bad = (on: boolean) => html`<input type="checkbox" .checked=${on} />`;',
      'export const good = (on: boolean) => html`<input type="checkbox" ?checked=${liveBoolean(on)} />`;',
      '',
    ].join('\n'),
  ],
};

/** @type {Record<string, import('eslint').Linter.LintMessage[]>} */
const results = {};

beforeAll(async () => {
  for (const [file, text] of Object.values(FIXTURES)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  try {
    const eslint = new ESLint({ cwd: root });
    const linted = await eslint.lintFiles(Object.values(FIXTURES).map(([file]) => file));
    for (const [key, [file]] of Object.entries(FIXTURES)) {
      results[key] = linted.find((r) => r.filePath === join(root, file))?.messages ?? [];
    }
  } finally {
    for (const [file] of Object.values(FIXTURES)) rmSync(join(root, file), { force: true });
  }
}, 120_000);

afterAll(() => {
  for (const [file] of Object.values(FIXTURES)) rmSync(join(root, file), { force: true });
});

const ruleMessages = (key, ruleId) =>
  (results[key] ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message);

describe('ESLint guardrails', () => {
  it('rejects Effect imports with the ADR 0015 remediation', () => {
    const messages = ruleMessages('coreEffect', 'no-restricted-imports');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('0015-runtime-size-spike.md');
    expect(messages[0]).toContain('@gyral/effect');
  });

  it('leaves src/internal to the dependency check (Labs adapters live there)', () => {
    expect(ruleMessages('internalEffect', 'no-restricted-imports')).toEqual([]);
  });

  it('keeps @gyral/core the bottom layer', () => {
    const messages = ruleMessages('coreLayer', 'no-restricted-imports');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('bottom layer');
  });

  it('lets layer-1 packages import only @gyral/core', () => {
    const messages = ruleMessages('layerOne', 'no-restricted-imports');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Layer-1 packages may only import @gyral/core');
  });

  it('keeps @lit-labs/ssr behind the internal adapter', () => {
    const messages = ruleMessages('ssrLabs', 'no-restricted-imports');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('src/internal/lit.ts');
  });

  it('rejects .checked property bindings and accepts ?checked with liveBoolean', () => {
    const messages = results.checked?.filter((m) => m.ruleId === 'no-restricted-syntax') ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(3);
    expect(messages[0]?.message).toContain('liveBoolean');
  });
});

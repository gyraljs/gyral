import { describe, expect, it } from 'vitest';
import { DOCS, tsBlocks } from '../check-skill.mjs';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

describe('check-skill tsBlocks', () => {
  it('extracts ts and typescript blocks with their first code line', () => {
    const md = [
      '# Title',
      '```ts',
      "import { define } from '@gyral/core';",
      '```',
      'text',
      '```typescript',
      'const x = 1;',
      'void x;',
      '```',
    ].join('\n');
    expect(tsBlocks(md)).toEqual([
      { line: 3, code: "import { define } from '@gyral/core';" },
      { line: 7, code: 'const x = 1;\nvoid x;' },
    ]);
  });

  it('skips text and other fences, so fragments can opt out', () => {
    const md = ['```text', 'npm create gyral@latest', '```', '```json', '{}', '```'].join('\n');
    expect(tsBlocks(md)).toEqual([]);
  });
});

it('cleans extraction artifacts after a failing compiler and after an extraction exception', () => {
  const root = mkdtempSync(join(tmpdir(), 'gyral-skill-failure-'));
  const write = (path, text) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  try {
    write('scripts/check-skill.mjs', '');
    copyFileSync(
      join(import.meta.dirname, '../check-skill.mjs'),
      join(root, 'scripts/check-skill.mjs'),
    );
    for (const doc of DOCS) write(doc, '# Empty reference');
    for (const name of new Set(
      DOCS.filter((doc) => doc.startsWith('packages/')).map((doc) => doc.split('/')[1]),
    ))
      write(`packages/${name}/package.json`, JSON.stringify({ name: `@gyral/${name}` }));
    write('skills/gyral/SKILL.md', '# Fixture\n```ts\nconst wrong: string = 1;\n```');
    write(
      'packages/core/package.json',
      JSON.stringify({ name: '@gyral/core', exports: { '.': './src/index.ts' } }),
    );
    write(
      'node_modules/.bin/tsc',
      '#!/usr/bin/env node\nconsole.error(".skill-check/skills_gyral_SKILL_md_L3.ts: deliberate compiler failure");\nprocess.exit(2);\n',
    );
    chmodSync(join(root, 'node_modules/.bin/tsc'), 0o755);
    const run = () =>
      spawnSync(process.execPath, ['scripts/check-skill.mjs'], { cwd: root, encoding: 'utf8' });
    const failed = run();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('skills/gyral/SKILL.md:3 (block): deliberate compiler failure');
    expect(existsSync(join(root, '.skill-check'))).toBe(false);
    rmSync(join(root, DOCS[0]));
    expect(run().status).toBe(1);
    expect(existsSync(join(root, '.skill-check'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

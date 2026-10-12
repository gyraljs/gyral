// Consumer branch coverage must describe authored conditions, not locator fallbacks.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(import.meta.dirname, '../../../..');

function coverage(locations: boolean): { branches: string[]; counts: object } {
  const root = mkdtempSync(join(tmpdir(), 'gyral-coverage-'));
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(
    join(root, 'src/view.ts'),
    `import { html as h } from '@gyral/core';
export function view(active: boolean) {
  if (active) return h\`<p>Active</p>\`;
  return h\`<p>Empty</p>\`;
}
`,
  );
  writeFileSync(
    join(root, 'view.test.ts'),
    `import { expect, test } from 'vitest';
import { view } from './src/view.js';
test('both authored branches', () => {
  expect(view(true).values).toEqual([]);
  expect(view(false).values).toEqual([]);
});`,
  );
  writeFileSync(
    join(root, 'vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';
import { gyralVitePreset } from ${JSON.stringify(join(repo, 'packages/core/src/vite.ts'))};
const preset = gyralVitePreset({ types: false });
export default defineConfig({
  ...preset,
  plugins: preset.plugins.filter(p => ${locations ? 'true' : "p.name !== 'gyral:template-locations'"}),
  resolve: { alias: { '@gyral/core': ${JSON.stringify(join(repo, 'packages/core/src/index.ts'))} } },
  test: { include: ['view.test.ts'], coverage: {
    enabled: true, provider: 'v8', include: ['src/view.ts'], reporter: ['json'],
  } },
});`,
  );
  try {
    execFileSync(process.execPath, [join(repo, 'node_modules/vitest/vitest.mjs'), 'run'], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 20000,
    });
    const report = JSON.parse(
      readFileSync(join(root, 'coverage/coverage-final.json'), 'utf8'),
    ) as Record<string, { branchMap: Record<string, { type: string }>; b: object }>;
    const file = report[join(root, 'src/view.ts')];
    if (file === undefined) throw new Error('Missing fixture coverage');
    return { branches: Object.values(file.branchMap).map((branch) => branch.type), counts: file.b };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('template locator coverage', () => {
  it('preserves authored branch coverage for aliased templates', () => {
    const ordinary = coverage(false);
    const located = coverage(true);
    expect(Object.keys(ordinary.branches)).not.toHaveLength(0);
    expect(located).toEqual(ordinary);
  }, 30000);
});

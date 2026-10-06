import { describe, expect, it } from 'vitest';
import {
  cleanRoomFiles,
  findLitProvenance,
  inCleanRoom,
  LIT_MARKERS,
} from '../check-provenance.mjs';

describe('check-provenance (ADR 0018 clean room)', () => {
  it('covers packages, tests, examples, scripts and the skill, not design history', () => {
    for (const path of [
      'packages/core/src/view/render/list.ts',
      'packages/ssr/test/render.node.test.ts',
      'packages/core/bench/render.bench.test.ts',
      'packages/mcp/scripts/build-corpus.mjs',
      'packages/create-gyral/templates/ssr/src/entry-client.ts',
      'packages/core/package.json',
      'packages/core/README.md',
      'examples/counter/src/counter.ts',
      'examples/isomorphic/server/app.ts',
      'scripts/smoke-prod.mjs',
      'scripts/test/eslint-guardrails.test.mjs',
      'skills/gyral/references/view.md',
      'package.json',
      'pnpm-workspace.yaml',
    ]) {
      expect(inCleanRoom(path), path).toBe(true);
    }
    for (const path of [
      'docs/design-docs/0012-ssr.md',
      'scripts/check-provenance.mjs',
      'scripts/test/check-provenance.test.mjs',
    ]) {
      expect(inCleanRoom(path), path).toBe(false);
    }
    const files = cleanRoomFiles();
    expect(files).toContain('packages/core/src/view/index.ts');
    expect(files).toContain('skills/gyral/SKILL.md');
    expect(files.some((f) => f.includes('/node_modules/') || f.includes('/dist/'))).toBe(false);
  });

  it('flags every Lit marker with file and line', () => {
    for (const marker of LIT_MARKERS) {
      const problems = findLitProvenance('a.ts', `const ok = 1;\nconst x = '${marker}';`);
      expect(problems).toEqual([`a.ts:2: contains the Lit marker "${marker}"`]);
    }
  });

  it('flags imports of Lit packages, static and dynamic', () => {
    const text = [
      "import { html } from 'lit';",
      "import { render } from 'lit-html/lit-html.js';",
      "export { LitElement } from 'lit-element';",
      "import { render } from '@lit-labs/ssr';",
      "import { ReactiveElement } from '@lit/reactive-element';",
      "const m = await import('lit/directives/repeat.js');",
    ].join('\n');
    expect(findLitProvenance('b.ts', text)).toEqual([
      'b.ts:1: imports "lit"',
      'b.ts:2: imports "lit-html/lit-html.js"',
      'b.ts:3: imports "lit-element"',
      'b.ts:4: imports "@lit-labs/ssr"',
      'b.ts:5: imports "@lit/reactive-element"',
      'b.ts:6: imports "lit/directives/repeat.js"',
    ]);
  });

  it('flags Lit packages declared as dependencies or overrides', () => {
    const manifest = JSON.stringify({
      dependencies: { '@gyral/core': '0.3.0', 'lit-html': '3.3.0' },
      devDependencies: { lit: '3.3.3', literally: '1.0.0' },
      peerDependencies: { '@lit-labs/ssr': '^4.1.0' },
      pnpm: { overrides: { 'lit-element': '4.2.2' } },
    });
    expect(findLitProvenance('examples/x/package.json', manifest)).toEqual([
      'examples/x/package.json: declares "lit-html" in dependencies',
      'examples/x/package.json: declares "lit" in devDependencies',
      'examples/x/package.json: declares "@lit-labs/ssr" in peerDependencies',
      'examples/x/package.json: declares "lit-element" in overrides',
    ]);
    const workspace = 'packages:\n  - packages/*\noverrides:\n  lit-html: 3.3.0\n';
    expect(findLitProvenance('pnpm-workspace.yaml', workspace)).toEqual([
      'pnpm-workspace.yaml:4: declares "lit-html"',
    ]);
  });

  it("accepts Gyral's own code, including words that merely start with lit", () => {
    const text = [
      "import { literal } from './literal.js';",
      "import x from 'literally';",
      'const split = "<!--gyral:abc-->"; // splitText, literal, litmus',
    ].join('\n');
    expect(findLitProvenance('c.ts', text)).toEqual([]);
  });
});

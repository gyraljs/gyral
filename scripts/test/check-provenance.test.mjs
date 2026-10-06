import { describe, expect, it } from 'vitest';
import { CLEAN_ROOM_DIRS, findLitProvenance, LIT_MARKERS } from '../check-provenance.mjs';

describe('check-provenance (ADR 0018 clean room)', () => {
  it('covers the view layer', () => {
    expect(CLEAN_ROOM_DIRS).toContain('packages/core/src/view');
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

  it("accepts Gyral's own code, including words that merely start with lit", () => {
    const text = [
      "import { literal } from './literal.js';",
      "import x from 'literally';",
      'const split = "<!--gyral:abc-->"; // splitText, literal, litmus',
    ].join('\n');
    expect(findLitProvenance('c.ts', text)).toEqual([]);
  });
});

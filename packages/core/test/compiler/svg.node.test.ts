// The Vite template compiler for svg templates (view/01-templates.md "Compiled", "svg
// templates"): svg`…` call sites are found by the same rules as html`…` (imported from a
// template source, or ns.svg), normalized as SVG content, flagged `svg: true`, and rewritten
// into `compiledSvg(…)`; rule errors, references it can't follow and an uncompiled svg left in
// the bundle fail the build, and parse5 checks svg templates inside an <svg>.
import { describe, expect, it } from 'vitest';
import { normalize, type TemplateObject } from '../../src/view/index.js';
import { clientObject } from '../view/helpers.js';
import { buildApp, buildError, importBuilt, VIEW } from './fixture.js';

const MARK = ['<path class="mark" d=', ' />'];
const svgObject = (strings: readonly string[]): TemplateObject =>
  clientObject(normalize(strings, undefined, true));

describe('template compiler: svg templates', () => {
  it('hoists a flagged template object and calls compiledSvg; html alongside', async () => {
    const { code } = await buildApp({
      'main.ts': [
        `import { html, svg, templateOf } from '${VIEW}';`,
        `export const mark = (d: string) => svg\`<path class="mark" d=\${d} />\`;`,
        `export const card = (d: string) => html\`<svg viewBox="0 0 1 1">\${mark(d)}</svg>\`;`,
        `export { templateOf };`,
      ].join('\n'),
    });
    expect(code).toContain(`"id": "${normalize(MARK, undefined, true).id}"`);
    expect(code).toMatch(/"svg": true/);
    expect(code).toMatch(/compiledSvg\d*\(_gyral\$t\d, \[d\]\)/);
    expect(code).toMatch(/compiled\(_gyral\$t\d, \[mark\(d\)\]\)/);
    expect(code).not.toMatch(/\bsvg`</);

    const built = await importBuilt(code);
    const templateOf = built['templateOf'] as (r: unknown) => TemplateObject;
    const mark = built['mark'] as (d: string) => { values: unknown[] };
    expect(templateOf(mark('M0 0'))).toEqual(svgObject(MARK));
    expect(mark('M0 0').values).toEqual(['M0 0']);
  });

  it('compiles ns.svg for a namespace import, and svg imported under another name', async () => {
    const { code } = await buildApp({
      'main.ts': [
        `import * as view from '${VIEW}';`,
        `import { svg as s } from '${VIEW}';`,
        `export const a = view.svg\`<g>\${1}</g>\`;`,
        `export const b = s\`<circle r=\${1} />\`;`,
      ].join('\n'),
    });
    expect(code).toContain(`"id": "${normalize(['<g>', '</g>'], undefined, true).id}"`);
    expect(code).toContain(`"id": "${normalize(['<circle r=', ' />'], undefined, true).id}"`);
    expect(code).not.toMatch(/\bsvg`</);
  });

  it('fails on a template rule in an svg template', async () => {
    const error = await buildError({
      'main.ts': `import { svg } from '${VIEW}';\nexport const a = svg\`<div>\${1}</div>\`;`,
    });
    expect(error.message).toContain('[gyral template rule 10]');
    expect(error.message).toContain('this is an svg template');
  });

  it('fails on a use of svg it cannot follow', async () => {
    const error = await buildError({
      'main.ts': `import { svg } from '${VIEW}';\nconst s = svg;\nexport const a = s\`<g></g>\`;`,
    });
    expect(error.message).toContain("can't be compiled");
    expect(error.message).toMatch(/> 2 \| const s = svg;/);
  });

  it('fails when an uncompiled svg survives in the bundle (re-export it cannot see)', async () => {
    const error = await buildError({
      'tags.ts': `export { svg } from '${VIEW}';`,
      'main.ts': `import { svg } from './tags';\nexport const a = svg\`<g>\${1}</g>\`;`,
    });
    expect(error.message).toContain('an uncompiled svg template remains');
  });

  it('checks svg templates with parse5 inside an <svg> (no false repairs)', async () => {
    const { code } = await buildApp({
      'main.ts': [
        `import { svg } from '${VIEW}';`,
        `export const a = svg\`<clipPath id="c"><rect /></clipPath><linearGradient>`,
        `  <stop offset="0" /></linearGradient><foreignObject><p>\${1}</p></foreignObject>\`;`,
      ].join('\n'),
    });
    expect(code).toContain('compiledSvg(');
  });

  it('keeps segments (with SVG-content child ops) in SSR builds', async () => {
    const { code } = await buildApp(
      { 'main.ts': `import { svg } from '${VIEW}';\nexport const a = svg\`<g>\${1}</g>\`;` },
      { ssr: true },
    );
    expect(code.replace(/\s/g, '')).toContain('{"k":"child","in":"g","svg":true}');
  });
});

// The Vite template compiler (view/01-templates.md "Compiled", view/09-template-rules.md):
// real `vite build`s of small fixture apps that import `html` from core's view module.
import { describe, expect, it } from 'vitest';
import { normalize, type TemplateObject } from '../../src/view/index.js';
import { buildApp, buildError, importBuilt, VIEW } from './fixture.js';

const GREET = ['<p class="greeting">Hello ', '!</p>'];

/** The template object a client build carries: no segments, no loc. */
function clientObject(strings: readonly string[]): Omit<TemplateObject, 'segments'> {
  const { id, html, parts, server } = normalize(strings);
  return { id, html, parts, server };
}

describe('template compiler: rewriting call sites', () => {
  it('hoists the template object (same id as the runtime normalizer) and calls compiled', async () => {
    const { code } = await buildApp({
      'main.ts': [
        `import { html, templateOf } from '${VIEW}';`,
        `type Name = string;`,
        `export const greet = (name: Name) => html\`<p class="greeting">`,
        `  Hello \${name}!`,
        `</p>\`;`,
        `export const again = (name: Name) => html\`<p class="greeting">Hello \${name}!</p>\`;`,
        `export { templateOf };`,
      ].join('\n'),
    });
    const { id } = normalize(GREET);
    // Both call sites normalize to the same strings: one hoisted object.
    expect(code.match(new RegExp(`"id": "${id}"`, 'g'))).toHaveLength(1);
    expect(code).toMatch(/compiled\(_gyral\$t0, \[name\]\)/);
    expect(code).not.toMatch(/\bhtml`</);

    const built = await importBuilt(code);
    const templateOf = built['templateOf'] as (r: unknown) => TemplateObject;
    const greet = built['greet'] as (name: string) => { values: unknown[] };
    expect(templateOf(greet('Ada'))).toEqual(clientObject(GREET));
    expect(greet('Ada').values).toEqual(['Ada']);
  });

  it('keeps value order, nested templates and expressions with their own backticks', async () => {
    const { code } = await buildApp({
      'main.ts': [
        `import { html, templateOf } from '${VIEW}';`,
        `const label = (n: number) => \`#\${n}\`;`,
        `export const row = (n: number, on: boolean) =>`,
        `  html\`<li class="row \${on ? 'on' : 'off'}" ?hidden=\${!on}>\${label(n)} \${html\`<b>\${n * 2}</b>\`}</li>\`;`,
        `export { templateOf };`,
      ].join('\n'),
    });
    const built = await importBuilt(code);
    const row = built['row'] as (n: number, on: boolean) => { values: unknown[] };
    const templateOf = built['templateOf'] as (r: unknown) => TemplateObject;
    const result = row(3, false);
    expect(result.values.slice(0, 3)).toEqual(['off', true, '#3']);
    expect(templateOf(result)).toEqual(
      clientObject(['<li class="row ', '" ?hidden=', '>', ' ', '</li>']),
    );
    const inner = result.values[3] as { values: unknown[] };
    expect(inner.values).toEqual([6]);
    expect(templateOf(inner)).toEqual(clientObject(['<b>', '</b>']));
  });

  it('leaves locally shadowed html, and tags from other modules, alone', async () => {
    const { code } = await buildApp({
      'main.ts': [
        `import { html } from '${VIEW}';`,
        `const other = (s: TemplateStringsArray) => s.join('|');`,
        `export const a = other\`<p>x</p>\`;`,
        `export function b(html: (s: TemplateStringsArray) => string) { return html\`<i>y</i>\`; }`,
        `export const c = html\`<p>z</p>\`;`,
      ].join('\n'),
    });
    expect(code).toContain('other`<p>x</p>`');
    expect(code).toContain('html`<i>y</i>`');
    expect(code).toContain(`"id": "${normalize(['<p>z</p>']).id}"`);
  });

  it('compiles ns.html for a namespace import', async () => {
    const { code } = await buildApp({
      'main.ts': `import * as view from '${VIEW}';\nexport const a = view.html\`<p>\${1}</p>\`;`,
    });
    expect(code).toContain(`"id": "${normalize(['<p>', '</p>']).id}"`);
    expect(code).not.toMatch(/\bhtml`</);
  });

  it('compiles html in dependencies under node_modules', async () => {
    const { code } = await buildApp({
      'node_modules/fixture-badges/package.json': JSON.stringify({
        name: 'fixture-badges',
        type: 'module',
        exports: './index.js',
      }),
      'node_modules/fixture-badges/index.js': `import { html } from '${VIEW}';\nexport const badge = (t) => html\`<span class="badge">\${t}</span>\`;\n`,
      'main.ts': `import { badge } from 'fixture-badges';\nexport const b = badge('new');`,
    });
    expect(code).toContain(`"id": "${normalize(['<span class="badge">', '</span>']).id}"`);
    expect(code).not.toMatch(/\bhtml`</);
  });

  it('honours the sources option (a module re-exporting html and compiled)', async () => {
    const files = {
      'tags.ts': `export { html, compiled } from '${VIEW}';`,
      'main.ts': `import { html } from './tags';\nexport const a = html\`<p>\${1}</p>\`;`,
    };
    const { code } = await buildApp(files, { compiler: { sources: ['./tags'] } });
    expect(code).toContain(`"id": "${normalize(['<p>', '</p>']).id}"`);
  });
});

describe('template compiler: client and server output', () => {
  const files = {
    'main.ts': `import { html, templateOf } from '${VIEW}';\nexport const v = templateOf(html\`<p class="x">\${'a'}</p>\`);`,
  };

  it('leaves the runtime preparer out of client builds (gyral-compiled condition)', async () => {
    const { code } = await buildApp(files);
    expect(code).not.toContain('"segments"');
    // The tokenizer, tree builder and rule messages stay out; only the stub remains.
    for (const marker of [
      'gyral template rule',
      'is an event binding',
      'TreeBuilder',
      'parseFragment',
    ]) {
      expect(code).not.toContain(marker);
    }
    expect(code).toContain('gyral-compiled condition');
  });

  it('keeps segments in SSR builds', async () => {
    const { code } = await buildApp(files, { ssr: true });
    const built = await importBuilt(code);
    expect(built['v']).toEqual({
      ...clientObject(['<p class="x">', '</p>']),
      segments: normalize(['<p class="x">', '</p>']).segments,
    });
  });
});

describe('template compiler: build errors', () => {
  it('fails on a template rule with the rule number and a code frame', async () => {
    const error = await buildError({
      'main.ts': [
        `import { html } from '${VIEW}';`,
        `const go = 1;`,
        `export const bad = html\`<button @click=\${go}>Go</button>\`;`,
      ].join('\n'),
    });
    expect(error.message).toContain('[gyral template rule 1]');
    expect(error.message).toContain('data-intent=${i.Name}');
    expect(error.message).toContain('main.ts:3:20');
    expect(error.message).toMatch(/> 3 \| export const bad = html`<button/);
    expect(error.message).toMatch(/\n\s+\|\s{20}\^+/);
  });

  it('fails on a use of html it cannot follow', async () => {
    const error = await buildError({
      'main.ts': `import { html } from '${VIEW}';\nconst h = html;\nexport const a = h\`<p>x</p>\`;`,
    });
    expect(error.message).toContain("This use of html can't be compiled");
    expect(error.message).toMatch(/> 2 \| const h = html;/);
  });

  it('fails when an uncompiled html survives in the bundle (re-export it cannot see)', async () => {
    const error = await buildError({
      'tags.ts': `export { html } from '${VIEW}';`,
      'main.ts': `import { html } from './tags';\nexport const a = html\`<p>\${1}</p>\`;`,
    });
    expect(error.message).toContain('an uncompiled html template remains');
  });
});

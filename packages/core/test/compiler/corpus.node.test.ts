// Compiled template objects equal the runtime normalizer's, for every template in the corpus
// (the examples' and packages' `html` templates): client builds without segments (and without
// ids in production), SSR builds with them. This is what lets a compiled server hydrate a
// runtime client and the reverse.
import { describe, expect, it } from 'vitest';
import { normalize, type TemplateObject } from '../../src/view/index.js';
import { corpus } from '../view/corpus.js';
import { clientObject } from '../view/helpers.js';
import { buildApp, importBuilt, VIEW } from './fixture.js';

/** Corpus templates the normalizer accepts (client templates; page shells are server-only). */
const valid = corpus
  .map((t) => t.strings)
  .filter((strings) => {
    if (strings.length === 0) return false;
    try {
      return !normalize(strings).server;
    } catch {
      return false;
    }
  });

/** Template-literal source text for cooked strings, with a numbered value in each hole. */
const literal = (strings: readonly string[]): string =>
  strings
    .map((s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'))
    .reduce((out, s, k) => `${out}\${${String(k - 1)}}${s}`);

const fixture = {
  'main.ts': [
    `import { html, templateOf } from '${VIEW}';`,
    `export const all = [`,
    ...valid.map((s) => `  templateOf(html\`${literal(s)}\`),`),
    `];`,
  ].join('\n'),
};

// SSR builds keep the server-only fields: `segments`, and `staticStyles` when there are any.
const strip = (t: TemplateObject, segments: boolean, production: boolean): object =>
  segments
    ? {
        ...clientObject(t),
        segments: t.segments,
        ...(t.staticStyles === undefined ? {} : { staticStyles: t.staticStyles }),
      }
    : clientObject(t, production);

describe('compiled templates equal runtime ones (corpus)', () => {
  it('has a corpus to compare', () => {
    expect(valid.length).toBeGreaterThan(100);
  });

  // A production client build drops the ids (01 "Template ids"); SSR builds keep them.
  for (const [ssr, production] of [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const) {
    const mode = production ? 'production' : 'development';
    it(`${ssr ? 'SSR' : 'client'} build (${mode})`, async () => {
      const built = await importBuilt((await buildApp(fixture, { ssr, production })).code);
      expect(built['all']).toEqual(valid.map((s) => strip(normalize(s), ssr, production)));
    });
  }
});

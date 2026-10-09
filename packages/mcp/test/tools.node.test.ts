// Every tool's logic against the committed docs snapshot and this repo's sources.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCorpus } from '../scripts/build-corpus.mjs';
import { findApi, formatApi, listApi } from '../src/api.js';
import { checkSnippet } from '../src/check.js';
import { anchorFor, getDoc, parseLlmsFull, searchDocs } from '../src/docs.js';
import { findExample, formatExample, listExamples } from '../src/examples.js';
import { scaffold, validTag } from '../src/scaffold.js';
import type { Corpus } from '../src/types.js';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));
let corpus: Corpus;

// Building the corpus is CPU-bound (several seconds when the suite runs in parallel).
beforeAll(() => {
  corpus = buildCorpus(parseLlmsFull);
}, 60_000);

describe('docs', () => {
  it('parses every page of llms-full.txt with sections and site anchors', () => {
    const titles = corpus.docs.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(['Getting started', 'Forms', '@gyral/core']));
    const forms = corpus.docs.find((p) => p.title === 'Forms');
    expect(forms?.url).toBe('https://gyral.dev/docs/forms/');
    expect(forms?.sections.map((s) => s.url)).toContain(
      'https://gyral.dev/docs/forms/#the-server-half',
    );
  });

  it('uses the site ids for API symbols and example titles', () => {
    const api = 'https://gyral.dev/docs/api/ssr/';
    expect(anchorFor(api, 4, '`prerender`', '`@gyral/ssr/static`')).toBe('ssr-static-prerender');
    expect(anchorFor('https://gyral.dev/examples/', 3, 'Hello world', 'Basics')).toBe(
      'hello-world-title',
    );
    expect(anchorFor('https://gyral.dev/docs/forms/', 2, 'The server half', '')).toBe(
      'the-server-half',
    );
  });

  it('ignores headings and separators inside code fences', () => {
    const pages = parseLlmsFull(
      '# A\n\nSource: https://x/a/\n\n```sh\n# not a heading\n---\n## nor this\n```\n\n## Real\n\ntext',
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]?.sections.map((s) => s.heading)).toEqual(['', 'Real']);
  });

  it('ranks the guide section first for a conceptual query', () => {
    // Two guides have a `Lazy hydration` section (server rendering, code-splitting); either
    // beats a page that only mentions it.
    const [first] = searchDocs(corpus.docs, 'lazy hydration', 3);
    expect(first?.url).toMatch(
      /^https:\/\/gyral\.dev\/docs\/(server-rendering|code-splitting)\/#lazy-hydration$/,
    );
    expect(searchDocs(corpus.docs, 'switch concurrency', 1)[0]?.url).toBe(
      'https://gyral.dev/docs/effects/#concurrency-lanes',
    );
    expect(searchDocs(corpus.docs, 'the and', 5)).toEqual([]);
  });

  it('reads a page by name, path or URL, and one section by anchor', () => {
    expect(getDoc(corpus.docs, 'intent')).toMatch(/^# Intent\n/);
    expect(getDoc(corpus.docs, '/docs/intent/')).toBe(getDoc(corpus.docs, 'intent'));
    const section = getDoc(corpus.docs, 'https://gyral.dev/docs/forms/#the-server-half');
    expect(section).toMatch(/^# Forms › The server half/);
    expect(section).toContain('formAction');
    expect(getDoc(corpus.docs, 'no-such-page')).toBeUndefined();
  });

  it('caps long pages and lists their sections', () => {
    const core = getDoc(corpus.docs, 'api/core', 5000) ?? '';
    expect(core).toContain('[Truncated at 5000 characters');
    expect(core).toContain('https://gyral.dev/docs/api/core/#functions');
  });
});

describe('api', () => {
  it('finds a symbol with its declaration, doc and import path', () => {
    const { matches } = findApi(corpus.api, 'define');
    const [define] = matches;
    if (define === undefined || matches.length !== 1) throw new Error('expected one define');
    const text = formatApi(define);
    expect(text).toContain("from '@gyral/core'");
    // Both call forms (ADR 0023): the overloads are listed one after the other.
    expect(text).toContain('function define(): <');
    expect(text).toContain('>(): Definer<S, M, P, O>;');
    expect(text).toContain('Compiles a Model-View-Intent spec');
  });

  it('covers every published entry point', () => {
    const specifiers = new Set(corpus.api.map((e) => e.specifier));
    for (const s of ['@gyral/core', '@gyral/ssr/static', '@gyral/http/testing', '@gyral/testing'])
      expect(specifiers).toContain(s);
    expect(findApi(corpus.api, 'prerender', 'ssr').matches[0]?.specifier).toBe('@gyral/ssr/static');
  });

  it("teaches 0.3's view layer from the sources, examples and skill, with no Lit left", () => {
    const at = (name: string) => findApi(corpus.api, name).matches.map((m) => m.specifier);
    expect(at('each')).toContain('@gyral/core');
    expect(at('prop')).toContain('@gyral/core');
    expect(at('renderToString')).toContain('@gyral/core/server');
    expect(at('clientAssetsFromManifest')).toContain('@gyral/ssr/static');
    expect(corpus.api.some((e) => e.specifier === '@gyral/core/eslint')).toBe(true);
    for (const gone of ['repeat', 'liveBoolean', 'serverHtml', 'unsafeCSS']) {
      expect(findApi(corpus.api, gone).matches, gone).toEqual([]);
    }
    // Example titles and descriptions come from the docs snapshot (refreshed with mcp:refresh).
    const sources = corpus.examples.map((e) => e.components);
    const taught = JSON.stringify([corpus.api, sources, corpus.skill]);
    expect(taught).not.toMatch(/from 'lit|lit-html|@lit-labs|liveBoolean|serverHtml/);
  });

  it('suggests close names and lists exports', () => {
    expect(findApi(corpus.api, 'renderPge').suggestions).toContain('renderPage');
    expect(listApi(corpus.api, 'time')).toMatch(/## @gyral\/time\n- function: .*delay/);
  });
});

describe('examples', () => {
  it('lists every example with a description', () => {
    expect(corpus.examples.length).toBeGreaterThanOrEqual(20);
    expect(listExamples(corpus.examples)).toContain('**counter**: Counter.');
  });

  it('returns the component source', () => {
    const counter = findExample(corpus.examples, 'counter');
    if (counter === undefined) throw new Error('expected the counter example');
    expect(counter.components.map((f) => f.path)).toEqual(['src/counter.ts']);
    expect(counter.otherFiles).toContain('src/main.ts');
    expect(formatExample(counter)).toContain("define<State, Msg>()('gy-counter'");
  });
});

describe('scaffold and check_snippet', () => {
  it('rejects invalid custom element names', () => {
    expect(validTag('Counter')).toMatch(/not a valid custom element name/);
    expect(validTag('my-counter')).toBeUndefined();
  });

  // Every template must typecheck against the real packages (this package's devDependencies).
  // Files are checked one at a time, so imports of sibling files are dropped; the basic test
  // imports its component, so it is checked appended to the component.
  const withoutLocalImports = (code: string): string =>
    code.replace(/^import [^\n]*'\.\/[^\n]*\n/gm, '');

  for (const kind of ['basic', 'form', 'ssr-page'] as const) {
    it(`"${kind}" typechecks`, () => {
      const files = scaffold('demo-widget', kind, 'A demo.').files;
      const component = files[0]?.code ?? '';
      for (const file of files) {
        const code = file.path.endsWith('.test.ts')
          ? `${component}\n${withoutLocalImports(file.code)}`
          : withoutLocalImports(file.code);
        expect(checkSnippet(code, pkgDir).report, `${kind}: ${file.path}`).toMatch(
          /^No type errors/,
        );
      }
    }, 60_000);
  }

  it('reports type errors with positions', () => {
    const result = checkSnippet("import { define } from '@gyral/core';\ndefine(42);\n", pkgDir);
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.report).toMatch(/2:\d+ TS\d+/);
  }, 30_000);

  it('explains when it cannot run', () => {
    const result = checkSnippet('const x = 1;', join(pkgDir, 'no-such-dir'));
    expect(result).toMatchObject({ ran: false, ok: false });
    expect(result.report).toContain('No package.json');
  });
});

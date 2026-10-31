// Every tool's logic against the committed docs snapshot and this repo's sources
// (scaffold_component and check_snippet have their own files).
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCorpus } from '../scripts/build-corpus.mjs';
import { bareName, explainInternal, findApi, formatApi } from '../src/api.js';
import { indexApi } from '../src/api-index.js';
import { anchorFor, getDoc, parseLlmsFull, searchDocs } from '../src/docs.js';
import { findExample, formatExample, listExamples } from '../src/examples.js';
import { orientation, USE_CASES, workflow } from '../src/orientation.js';
import type { Corpus } from '../src/types.js';

let corpus: Corpus;

/** A page whose words appear inside others (`trusted`) and as camelCase parts. */
const PAGE = [
  '# A',
  '',
  'Source: https://x/a/',
  '',
  '## Types',
  '',
  'Trusted Types keep trusted markup trusted; entrust it, distrust the rest.',
  '',
  '## Servers',
  '',
  'Rust renders the page.',
  '',
  '## Props',
  '',
  'A `PropsChanged` message arrives after an update.',
].join('\n');

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

  // gyral-99t: "rust" matched inside "trusted", so Trusted Types ranked above the Rust guide.
  it('matches terms at word starts: prefixes and camelCase words, not inside a word', () => {
    const rust = searchDocs(corpus.docs, 'rust', 8);
    expect(rust[0]?.url).toMatch(/^https:\/\/gyral\.dev\/docs\/rust-servers\//);
    expect(rust.map((h) => h.url).join('\n')).not.toMatch(/trusted/);
    // A prefix still finds the longer word (hydrat → hydration), and a camelCase part its name.
    expect(searchDocs(corpus.docs, 'hydrat', 3).map((h) => h.url)).toContain(
      'https://gyral.dev/docs/server-rendering/#lazy-hydration',
    );
    const [changed] = searchDocs(parseLlmsFull(PAGE), 'changed', 1);
    expect(changed?.url).toBe('https://x/a/#props');
    expect(searchDocs(parseLlmsFull(PAGE), 'rust', 1)[0]?.url).toBe('https://x/a/#servers');
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

  it.each([
    ['makeLocalStorageDriver', '@gyral/core/storage'],
    ['makeIndexedDBDriver', '@gyral/core/indexeddb'],
    ['makeEventSourceDriver', '@gyral/http/sse'],
    ['makeWebSocketDriver', '@gyral/http/websocket'],
  ])('finds %s at its optional public entry', (symbol, specifier) => {
    const { matches } = findApi(corpus.api, symbol);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.specifier).toBe(specifier);
    expect(matches[0]?.declaration).toContain(symbol);
  });

  it("teaches 0.3's view layer from the sources, examples and skill, with no Lit left", () => {
    const at = (name: string) => findApi(corpus.api, name).matches.map((m) => m.specifier);
    expect(at('each')).toContain('@gyral/core');
    expect(at('prop')).toContain('@gyral/core');
    expect(at('renderToString')).toContain('@gyral/ssr');
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
    expect(findApi(corpus.api, 'renderP').suggestions[0]).toMatch(/^renderP/);
    expect(findApi(corpus.api, 'Reducr').suggestions).toContain('Reducer');
    // Nothing close: still the three nearest names.
    expect(findApi(corpus.api, 'qqqqqqqqqqqq').suggestions).toHaveLength(3);
    expect(indexApi(corpus.api, 'time')).toMatch(/- `delay` \(@gyral\/time\): delay\(ms, msg\)/);
  });

  it('accepts names as agents write them', () => {
    expect(bareName('define()')).toBe('define');
    expect(bareName('Update<S, M>')).toBe('Update');
    expect(bareName('typeof form')).toBe('form');
    expect(bareName('`each`')).toBe('each');
    expect(findApi(corpus.api, 'Update<State, Msg>').matches[0]?.name).toBe('Update');
  });

  it.each(['Reducer', 'Variant', 'ParseResult', 'StandardSchemaV1'])(
    'finds %s, which public types are built from',
    (name) => {
      const [entry] = findApi(corpus.api, name).matches;
      expect(entry?.specifier).toBe('@gyral/core');
      expect(entry?.kind).toBe('type');
    },
  );

  it('explains internal helper types instead of failing', () => {
    const names = new Set(corpus.internalTypes?.map((t) => t.name));
    for (const exported of ['Reducer', 'Variant', 'ParseResult', 'StandardSchemaV1'])
      expect(names.has(exported), exported).toBe(false);
    expect(names).toContain('SpecBody');
    const spec = explainInternal(corpus.internalTypes, 'SpecBody') ?? '';
    expect(spec).toContain('is not exported');
    expect(spec).toContain('ComponentSpec');
    const plugin = explainInternal(corpus.internalTypes, 'InlineConfig') ?? '';
    expect(plugin).toContain("import type { InlineConfig } from 'vite';");
    expect(explainInternal(corpus.internalTypes, 'define')).toBeUndefined();
  });

  it('keeps repo paths and tracker ids out of public doc comments', () => {
    const leaks = corpus.api.filter((e) =>
      /docs\/design-docs|\bview\/\d\d|\b0\d{3}-[\w-]+\.md\b|\bgyral-[a-z0-9]{3}\.\d+/.test(
        `${e.doc}\n${e.declaration}`,
      ),
    );
    expect(leaks.map((e) => `${e.specifier} ${e.name}`)).toEqual([]);
  });
});

describe('examples', () => {
  it('lists every example with a description', () => {
    expect(corpus.examples.length).toBeGreaterThanOrEqual(19);
    expect(listExamples(corpus.examples)).toContain('**hello-world**: Hello world.');
  });

  it('returns the component source', () => {
    const hello = findExample(corpus.examples, 'hello-world');
    if (hello === undefined) throw new Error('expected the hello-world example');
    expect(hello.components.map((f) => f.path)).toEqual(['src/hello.ts']);
    expect(hello.otherFiles).toContain('src/main.ts');
    expect(formatExample(hello)).toContain("define<State, Msg>()('gy-hello'");
  });
});

describe('start_here', () => {
  it('maps every use case to an example and a guide that exist', () => {
    const examples = new Set(corpus.examples.map((e) => e.name));
    for (const useCase of USE_CASES) {
      for (const example of useCase.examples) expect(examples, useCase.task).toContain(example);
      expect(getDoc(corpus.docs, useCase.doc), useCase.doc).toBeDefined();
    }
  });

  it('gives the model, rules, workflow and tool table', () => {
    const text = orientation(corpus, true);
    for (const part of ['## Rules', '## Workflow', '## Which tool when', '## Use cases'])
      expect(text).toContain(part);
    expect(text).toContain("define<State, Msg>()('my-tag'");
    expect(text).toContain('every(ms');
    expect(text).toContain('TemplateResult');
    expect(text).toContain('get_example "register" / "no-js-first"');
    expect(orientation(corpus, false)).not.toContain('`check_snippet` (type errors');
    expect(workflow(true)).toMatch(
      /start from get_example or scaffold_component.*check_snippet.*get_api only for a name you already saw/,
    );
    expect(workflow(false)).not.toContain('check_snippet');
  });
});

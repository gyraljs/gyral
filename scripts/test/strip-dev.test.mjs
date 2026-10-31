// Core's production build without development code (gyral-gpr): the per-module strip pass and
// the dist/prod/ tree built from it. The packed core is checked end to end by pack:check
// (lib/prod-build-fixture.mjs); these pin the rules.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProduction, prodTwin } from '../lib/prod-build.mjs';
import { importsOf, stripDevelopment } from '../lib/strip-dev.mjs';

const strip = async (code, options) => (await stripDevelopment(code, options)).code;

describe('stripDevelopment', () => {
  it('removes development branches and the imports only they used', async () => {
    const out = await strip(
      `import { DEV } from '#view-dev';
import { check } from './dev-check.js';
import { run } from './run.js';
export function go(x) {
  if (DEV) check(x);
  return DEV ? 'dev' : run(x);
}
`,
    );
    expect(out).not.toMatch(/DEV|check|#view-dev/);
    expect(importsOf(out)).toEqual(['./run.js']);
    expect(out).toContain('return run(x)');
  });

  it('keeps the other bindings of an import that also brings a flag', async () => {
    const out = await strip(
      `import { DEV, message } from './view/index.js';
export const say = (x) => { if (DEV) console.log(x); return message(1, x); };
`,
    );
    expect(out).toMatch(/import \{ message \} from "\.\/view\/index\.js"/);
    expect(out).not.toContain('console.log');
  });

  it('turns re-exported flags into false constants', async () => {
    const out = await strip(
      `export { DEV } from '#view-dev';
export { DEVTOOLS_ENABLED as devtoolsEnabled, devLive as live } from '#devtools';
`,
      { specifier: (s) => (s === '#devtools' ? './devtools-off.js' : undefined) },
    );
    expect(out).toMatch(/DEV = !1/);
    expect(out).toMatch(/devtoolsEnabled = !1/);
    expect(out).toMatch(/devLive as live/);
    expect(importsOf(out)).toEqual(['./devtools-off.js']);
  });

  it('removes what an early development return guarded, and what only that used', async () => {
    const out = await strip(
      `import { DEV } from '#view-dev';
import { sameChild } from './dev-check.js';
const impure = /* @__PURE__ */ new Set();
export function recheck(tag) {
  if (!DEV) return;
  if (impure.has(tag) || !sameChild(tag)) impure.add(tag);
}
`,
    );
    expect(out).not.toMatch(/impure|sameChild|dev-check/);
    expect(out).toMatch(/function recheck\(tag\) \{\s*\}/);
  });

  it('removes devtools call sites guarded by DEVTOOLS_ENABLED', async () => {
    const out = await strip(
      `import { DEVTOOLS_ENABLED, devUpdate } from '#devtools';
export function update(s) { if (DEVTOOLS_ENABLED) devUpdate(s); return s; }
`,
    );
    expect(out).not.toMatch(/devUpdate|#devtools/);
  });

  it("drops the side-effect imports stripping leaves, never the module's own", async () => {
    const out = await strip(
      `import { DEV } from '#view-dev';
import './register.js';
import { watch } from './undefined-tags.js';
export function define() { if (DEV) watch(); }
`,
    );
    expect(importsOf(out)).toEqual(['./register.js']);
  });

  it('maps specifiers of static imports, re-exports and import()', async () => {
    const out = await strip(
      `import { a } from '#prepare';
export { b } from './b.js';
export const load = () => import('#prepare').then(() => a);
`,
      { specifier: (s) => (s === '#prepare' ? '#prod/prepare' : undefined) },
    );
    expect(importsOf(out).sort()).toEqual(['#prod/prepare', './b.js']);
  });

  it('leaves a local DEV alone, and a DEV imported from another package', async () => {
    const out = await strip(
      `import { DEV as other } from 'some-package';
export const f = (DEV) => (DEV ? 1 : 2);
export const g = () => (other ? 3 : 4);
`,
    );
    expect(out).toMatch(/DEV \? 1 : 2/);
    expect(out).toMatch(/import \{ DEV as other \} from "some-package"/);
  });

  it('maps the result to the original sources', async () => {
    const map = JSON.stringify({
      version: 3,
      sources: ['../src/a.ts'],
      sourcesContent: ['export const a: number = 1;\n'],
      names: [],
      mappings: 'AAAA,OAAO,MAAM,CAAC,GAAW,CAAC,CAAC',
    });
    const { map: out } = await stripDevelopment('export const a = 1;\n', { file: 'a.js', map });
    expect(JSON.parse(out ?? '{}').sources).toEqual(['../src/a.ts']);
  });
});

describe('the production tree', () => {
  it('has twins of subpath imports without development, inside dist/prod/', () => {
    expect(
      prodTwin({
        'gyral-client-only': {
          development: './dist/invoker-fallback.js',
          default: './dist/invoker-fallback-used.js',
        },
        default: './dist/invoker-fallback.js',
      }),
    ).toEqual({
      'gyral-client-only': './dist/prod/invoker-fallback-used.js',
      default: './dist/prod/invoker-fallback.js',
    });
  });

  it('writes the modules production entries reach, stripped, at their dist/ paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-prod-tree-'));
    const files = {
      'index.js': `import { DEV } from '#view-dev';\nimport { warn } from './warn.js';\nimport { p } from '#prepare';\nexport const go = () => { if (DEV) warn(); return p; };\n`,
      'warn.js': 'export const warn = () => console.warn("dev");\n',
      'prepare.js': `import { live } from './live.js';\nexport const p = live;\n`,
      'live.js': `export { devLive as live } from '#devtools';\n`,
      'view/dev-off.js': 'export const DEV = false;\n',
      'devtools-off.js': 'export const devLive = () => [];\n',
      'use-states.js': 'export const register = () => {};\n',
      'vite.js': 'export const tool = 1;\n',
    };
    try {
      for (const [path, code] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, 'dist', path)), { recursive: true });
        writeFileSync(join(dir, 'dist', path), code);
      }
      const written = await buildProduction(dir, {
        exports: {
          '.': { node: './dist/index.js', default: './dist/prod/index.js' },
          './vite': './dist/vite.js',
        },
        imports: {
          '#view-dev': { development: './dist/view/dev.js', default: './dist/view/dev-off.js' },
          '#devtools': { development: './dist/devtools.js', default: './dist/devtools-off.js' },
          '#prepare': './dist/prepare.js',
          '#prod/prepare': './dist/prod/prepare.js',
        },
      });
      expect(written).toEqual([
        'devtools-off.js',
        'index.js',
        'live.js',
        'prepare.js',
        'use-states.js',
      ]);
      const read = (path) => readFileSync(join(dir, 'dist/prod', path), 'utf8');
      expect(importsOf(read('index.js'))).toEqual(['#prod/prepare']);
      expect(importsOf(read('live.js'))).toEqual(['./devtools-off.js']);
      expect(existsSync(join(dir, 'dist/prod/warn.js'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes nothing for a package that publishes no production tree', async () => {
    expect(await buildProduction('/nowhere', { exports: { '.': './dist/index.js' } })).toEqual([]);
  });
});

describe("core's publish manifest", () => {
  const { exports, imports } = JSON.parse(
    readFileSync('packages/core/package.json', 'utf8'),
  ).publishConfig;

  it('gives browsers without development dist/prod/, everything else dist/', () => {
    const runtime = Object.entries(exports).filter(([, value]) => value.browser !== undefined);
    expect(runtime.map(([key]) => key).sort()).toEqual(
      ['.', './compiled', './indexeddb', './internal', './internal/server', './storage'].sort(),
    );
    for (const [, value] of runtime) {
      const prod = value.default.replace('./dist/', './dist/prod/');
      expect(value.default).toMatch(/^\.\/dist\/(?!prod\/)/);
      expect(Object.keys(value)).toEqual(['types', 'browser', 'default']);
      expect(value.browser).toEqual({ development: value.default, default: prod });
    }
  });

  it('has a #prod/ twin of every subpath import but the inlined flags', () => {
    const own = Object.keys(imports).filter((key) => !key.startsWith('#prod/'));
    for (const key of own) {
      const twin = imports[`#prod/${key.slice(1)}`];
      if (['#view-dev', '#devtools'].includes(key)) expect(twin).toBeUndefined();
      else expect(twin).toEqual(prodTwin(imports[key]));
    }
  });
});

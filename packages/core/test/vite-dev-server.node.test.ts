// The dev server's SSR renders development output with an INSTALLED @gyral/core (view/06
// "Development markers"): the fixture app gets core compiled the way it is published, in its
// own node_modules, where Vite would externalize it, plus a design-system package that depends
// on core. The dev server and the built server run in child processes: plain `node`, so no
// condition of the test runner leaks in.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CORE = resolve(import.meta.dirname, '..');
const VITE = realpathSync(resolve(CORE, '../../node_modules/vite'));
const MARKER = '<!--gyral:';

let root = '';

function write(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** Runs a module script with plain node in the fixture (no inherited NODE_OPTIONS). */
function node(script: string): string {
  write('script.mjs', script);
  const env = { ...process.env, NODE_OPTIONS: '', NODE_ENV: '' };
  return execFileSync(process.execPath, ['script.mjs'], { cwd: root, env, encoding: 'utf8' });
}

const PRESET = `
const { createServer, build } = await import(${JSON.stringify(join(VITE, 'dist/node/index.js'))});
const { gyralVitePreset } = await import('./node_modules/@gyral/core/dist/vite.js');
const base = { root: process.cwd(), configFile: false, logLevel: 'silent', ...gyralVitePreset() };
`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gyral-dev-server-'));
  const core = join(root, 'node_modules/@gyral/core');
  // Core's build config, minus the files eslint-guardrails.test.mjs writes into src meanwhile.
  write(
    'tsconfig.json',
    JSON.stringify({
      extends: join(CORE, 'tsconfig.build.json'),
      compilerOptions: { outDir: join(core, 'dist'), declaration: false, declarationMap: false },
      include: [join(CORE, 'src')],
      exclude: [join(CORE, 'src/**/__lint_fixture_*')],
    }),
  );
  const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', join(root, 'tsconfig.json')], {
    cwd: CORE,
    encoding: 'utf8',
  });
  if (tsc.status !== 0) throw new Error(`tsc failed:\n${tsc.stdout}${tsc.stderr}`);
  const manifest = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')) as {
    name: string;
    type: string;
    publishConfig: { exports: object; imports: object };
  };
  const { name, type, publishConfig } = manifest;
  write('node_modules/@gyral/core/package.json', JSON.stringify({ name, type, ...publishConfig }));
  symlinkSync(VITE, join(root, 'node_modules/vite'));
  write(
    'node_modules/ds/package.json',
    JSON.stringify({
      name: 'ds',
      type: 'module',
      exports: './index.js',
      peerDependencies: { '@gyral/core': '*' },
    }),
  );
  write(
    'node_modules/ds/index.js',
    `import { define, html } from '@gyral/core';
define()('ds-badge', { init: () => ({ n: 1 }), intent: {}, update: (s) => s, view: (s) => html\`<b>\${s.n}</b>\` });`,
  );
  write(
    'package.json',
    JSON.stringify({ name: 'app', type: 'module', dependencies: { '@gyral/core': '*', ds: '*' } }),
  );
  write(
    'app.ts',
    `import 'ds';
import { html } from '@gyral/core';
import { renderToString } from '@gyral/core/server';
export const page = (): string => renderToString(html\`<p>\${'hi'}</p><ds-badge></ds-badge>\`);`,
  );
}, 60_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('gyralVitePreset() and installed Gyral packages (view/06)', () => {
  it("renders development output in the dev server's SSR, one copy of core", () => {
    const html = node(`${PRESET}
const server = await createServer({
  ...base,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
});
try {
  const app = await server.ssrLoadModule('/app.ts');
  process.stdout.write(app.page());
} finally {
  await server.close();
}`);
    expect(html).toContain(MARKER);
    // The design system's define() reached the same core the renderer uses.
    expect(html).toMatch(/<ds-badge data-gyral-seed='[^']*'><template shadowrootmode="open">/);
    expect(html).toContain('<b>1</b>');
  });

  it('keeps `vite build` SSR output production (core stays external)', () => {
    node(`${PRESET}
await build({
  ...base,
  build: { ssr: 'app.ts', outDir: 'dist-ssr', minify: false, rolldownOptions: { output: { entryFileNames: 'app.js' } } },
});`);
    const bundle = readFileSync(join(root, 'dist-ssr/app.js'), 'utf8');
    expect(bundle).toContain('@gyral/core/server');
    const html = node(
      `const app = await import('./dist-ssr/app.js'); process.stdout.write(app.page());`,
    );
    expect(html).not.toContain(MARKER);
    expect(html).toContain('<b>1</b>');
  });
});

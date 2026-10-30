// Development checks in apps that install @gyral/core from npm (gyral-3pv): extracts the packed
// core into a throwaway app's node_modules, the flat layout npm gives an app, next to the
// workspace's Vite. Then, in a plain `node` child process (no condition of this one leaks in):
// - Vite's dependency optimizer pre-bundles core, as the dev server and Vitest's browser mode
//   do. Core's own imports (`#view-dev`, `#devtools`) must resolve with the `development`
//   condition there, so the pre-bundle carries the development checks: the skipped-view
//   recheck (G0017), with its body, and the devtools hook. Vite 8's optimizer left them to
//   rolldown's resolver, which knows no `development`, until gyral() named the conditions.
// - `vite build` bundles core for production: none of that code, and no message table.
// - An app that names its own resolve conditions without `development` gets none either.
import { execFile } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const VITE = realpathSync('node_modules/vite');
// Core's one registry dependency, from the workspace's install: no network.
const SPEC = realpathSync('packages/core/node_modules/@standard-schema/spec');

/** Development code, by what it is: each must be in the dev pre-bundle and not in production. */
const DEVELOPMENT = [
  ['the skipped-view recheck', /function checkSkippedView\(/],
  ['the recheck of a skipped view, with its body', /function recheckView\([^)]*\) \{\s*[^\s}]/],
  ['the devtools hook', /gyral devtools listener threw/],
  ['the message table', /rendered differently with the same state/],
];

const SCRIPT = `
const { build, createServer, resolveConfig, optimizeDeps } = await import(${JSON.stringify(join(VITE, 'dist/node/index.js'))});
const { gyral } = await import('@gyral/core/vite');
const [mode, conditions] = process.argv.slice(2);
const base = {
  root: process.cwd(),
  configFile: false,
  logLevel: 'silent',
  plugins: [gyral({ types: false })],
  ...(conditions === undefined ? {} : { resolve: { conditions: conditions.split(',') } }),
};
if (mode === 'serve') {
  const config = await resolveConfig({ ...base, cacheDir: 'cache' }, 'serve');
  await optimizeDeps(config, true);
} else {
  await build({ ...base, build: { outDir: 'dist', minify: false } });
}
`;

/** The text of every script file under `dir`. */
function scripts(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'))
    .join('\n');
}

/** Runs the script in the app with plain node; returns the output folder's scripts. */
async function vite(app, mode, conditions) {
  const out = join(app, mode === 'serve' ? 'cache' : 'dist');
  rmSync(out, { recursive: true, force: true });
  const env = { ...process.env, NODE_OPTIONS: '', NODE_ENV: '' };
  const args = ['script.mjs', mode, ...(conditions === undefined ? [] : [conditions])];
  await run(process.execPath, args, { cwd: app, env });
  return scripts(out);
}

/** Problems with development checks in an app that installs `coreTarball`. */
export async function devPrebundleFixture(coreTarball) {
  const app = mkdtempSync(join(tmpdir(), 'gyral-dev-prebundle-'));
  const problems = [];
  try {
    const modules = join(app, 'node_modules');
    mkdirSync(join(modules, '@gyral'), { recursive: true });
    mkdirSync(join(modules, '@standard-schema'));
    await run('tar', ['-xzf', coreTarball, '-C', app]);
    renameSync(join(app, 'package'), join(modules, '@gyral/core'));
    symlinkSync(SPEC, join(modules, '@standard-schema/spec'));
    symlinkSync(VITE, join(modules, 'vite'));
    const manifest = { name: 'app', type: 'module', dependencies: { '@gyral/core': '*' } };
    writeFileSync(join(app, 'package.json'), JSON.stringify(manifest));
    writeFileSync(
      join(app, 'index.html'),
      '<!doctype html><title>app</title><x-a></x-a><script type="module" src="/main.js"></script>',
    );
    writeFileSync(
      join(app, 'main.js'),
      "import { define, html } from '@gyral/core';\n" +
        "define()('x-a', { init: () => ({ n: 0 }), view: (s) => html`<p>${s.n}</p>` });\n",
    );
    writeFileSync(join(app, 'script.mjs'), SCRIPT);

    const dev = await vite(app, 'serve');
    for (const [what, pattern] of DEVELOPMENT) {
      if (!pattern.test(dev)) problems.push(`the dev pre-bundle of core lacks ${what}`);
    }
    const prod = await vite(app, 'build');
    for (const [what, pattern] of DEVELOPMENT) {
      if (pattern.test(prod)) problems.push(`the production build carries ${what}`);
    }
    const own = await vite(app, 'serve', 'module,browser,production');
    for (const [what, pattern] of DEVELOPMENT) {
      if (pattern.test(own))
        problems.push(`the pre-bundle under the app's own conditions carries ${what}`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
  return problems;
}

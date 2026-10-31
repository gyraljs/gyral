// Core's production build in apps that bundle it without Rollup (gyral-gpr): extracts the packed
// core into a throwaway app and bundles a small app with esbuild, which carries no constant
// across modules, so it keeps whatever development code core's modules still hold.
// - Without the `development` condition (esbuild's default, as gyral-rs's Askama client builds)
//   the bundle must come from dist/prod/ and hold no development module or check: the
//   skipped-view recheck, rule 15's element list, the undefined-tag watch, the message table,
//   the devtools hook. The same with `gyral-client-only`, which must still resolve its modules.
// - With `development`, all of them must be there (dist/, as before).
// - In plain Node (a child process), every runtime entry of dist/prod/ must export what its
//   dist/ twin exports, and both must server-render a component to the same markup. (Node
//   itself gets dist/: only the `browser` condition selects dist/prod/.)
import { execFile } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
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
import { build } from 'esbuild';

const run = promisify(execFile);
// Core's one registry dependency, from the workspace's install: no network.
const SPEC = realpathSync('packages/core/node_modules/@standard-schema/spec');

/** Development code by what it is, each as a module and a text only it has. */
const DEVELOPMENT = [
  ['the skipped-view recheck', 'view/render/dev-check.js', /function checkSkippedView\(/],
  ["rule 15's element list", 'view/normalize/component-name.js', / embed fencedframe /],
  ['the undefined-tag watch', 'undefined-tags.js', /function watchUndefinedTags\(/],
  ['the message table', 'view/messages.js', /rendered differently with the same state/],
  ['the devtools hook', 'devtools.js', /gyral devtools listener threw/],
];

const APP = `import { command, define, each, html, prop, subscription } from '@gyral/core';
const ticks = subscription('ticks', (emit) => { const id = setInterval(() => emit(1), 1000); return () => clearInterval(id); });
define()('x-list', {
  props: { label: prop.string({ default: 'Items' }) },
  init: () => ({ items: [{ id: 1, name: 'one' }], n: 0 }),
  intent: { Tick: true },
  update: { Tick: (s) => ({ ...s, n: s.n + 1 }) },
  subscriptions: () => [command(ticks, undefined, { key: 'ticks', onSuccess: () => ({ _tag: 'Tick' }) })],
  view: (s, _i, { props }) => html\`<h2>\${props.label} \${s.n}</h2><ul>\${each(s.items, (x) => x.id, (x) => html\`<li>\${x.name}</li>\`)}</ul>\`,
});
`;

const NODE = `const base = new URL('./node_modules/@gyral/core/dist/', import.meta.url);
const ENTRIES = ['index.js', 'internal.js', 'server.js', 'view/compiled.js', 'storage.js', 'indexeddb.js'];
const problems = [];
for (const entry of ENTRIES) {
  const full = Object.keys(await import(new URL(entry, base))).sort().join();
  const prod = Object.keys(await import(new URL('prod/' + entry, base))).sort().join();
  if (full !== prod) problems.push('dist/prod/' + entry + ' exports ' + prod + ', dist/' + entry + ' ' + full);
}
const page = async (tree) => {
  const { define, html } = await import(new URL(tree + 'index.js', base));
  const { renderToString } = await import(new URL(tree + 'server.js', base));
  define()('x-hello', { init: () => ({ n: 2 }), view: (s) => html\`<p title="\${s.n}">Hello \${s.n}</p>\` });
  return renderToString(html\`<main><x-hello></x-hello></main>\`);
};
const [full, prod] = [await page(''), await page('prod/')];
if (!full.includes('Hello')) problems.push('dist/ rendered ' + full);
if (full !== prod) problems.push('dist/prod/ rendered ' + prod + ', dist/ ' + full);
console.log(JSON.stringify(problems));
`;

/** esbuild's bundle of the app: its text (unminified) and the core modules in it. */
async function bundle(app, conditions) {
  const result = await build({
    entryPoints: [join(app, 'main.js')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions,
    metafile: true,
    logLevel: 'silent',
  });
  // The modules with code in the output (metafile.inputs also lists those tree-shaken away).
  const inputs = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0),
  );
  const core = inputs
    .map(([path]) => /node_modules\/@gyral\/core\/(dist\/.*)$/.exec(path)?.[1])
    .filter((path) => path !== undefined);
  return { text: result.outputFiles[0]?.text ?? '', core };
}

/** The minified size of the app's bundle without the development condition. */
async function minifiedBytes(app) {
  const result = await build({
    entryPoints: [join(app, 'main.js')],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.contents.length ?? 0;
}

/** Problems with core's production build in an app that installs `coreTarball`; and a size. */
export async function prodBuildFixture(coreTarball) {
  const app = mkdtempSync(join(tmpdir(), 'gyral-prod-build-'));
  const problems = [];
  let bytes = 0;
  try {
    const modules = join(app, 'node_modules');
    mkdirSync(join(modules, '@gyral'), { recursive: true });
    mkdirSync(join(modules, '@standard-schema'));
    await run('tar', ['-xzf', coreTarball, '-C', app]);
    renameSync(join(app, 'package'), join(modules, '@gyral/core'));
    symlinkSync(SPEC, join(modules, '@standard-schema/spec'));
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
    writeFileSync(join(app, 'main.js'), APP);
    writeFileSync(join(app, 'node.mjs'), NODE);

    for (const conditions of [[], ['gyral-client-only']]) {
      const named = conditions.length === 0 ? 'esbuild' : `esbuild with ${conditions.join()}`;
      const { text, core } = await bundle(app, conditions);
      const outside = core.filter((path) => !path.startsWith('dist/prod/'));
      if (outside.length > 0) {
        problems.push(`${named} bundled ${String(outside.length)} modules outside dist/prod/`);
      }
      for (const [what, module, pattern] of DEVELOPMENT) {
        if (core.includes(`dist/prod/${module}`) || pattern.test(text))
          problems.push(`${named} bundled ${what}`);
      }
      const clientOnly = core.includes('dist/prod/hydration-off.js');
      if (clientOnly !== conditions.includes('gyral-client-only'))
        problems.push(`${named} resolved hydration ${clientOnly ? 'off' : 'on'}`);
    }
    const dev = await bundle(app, ['development']);
    for (const [what, module, pattern] of DEVELOPMENT) {
      if (!dev.core.includes(`dist/${module}`) || !pattern.test(dev.text))
        problems.push(`esbuild with development lacks ${what}`);
    }
    bytes = await minifiedBytes(app);

    const env = { ...process.env, NODE_OPTIONS: '', NODE_ENV: '' };
    const { stdout } = await run(process.execPath, ['node.mjs'], { cwd: app, env });
    problems.push(...JSON.parse(stdout.trim().split('\n').at(-1) ?? '[]'));
    // The package's own claim: what a production bundle may hold is in dist/prod/ alone.
    const manifest = JSON.parse(readFileSync(join(modules, '@gyral/core/package.json'), 'utf8'));
    if (manifest.exports['.'].browser?.default !== './dist/prod/index.js')
      problems.push("core's browser export without development is not dist/prod/");
  } catch (error) {
    problems.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
  return { problems, bytes };
}

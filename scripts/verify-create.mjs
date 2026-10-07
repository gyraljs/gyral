// pnpm verify:create — what `npm create gyral` gives a user, end to end. Packs every package,
// runs create-gyral FROM ITS TARBALL for each template, points the generated app's @gyral/*
// at the tarballs, installs with npm (third-party packages from the registry, so it needs
// network, so it stays out of `pnpm check`) and runs the app's typecheck, build and tests.
// Run it after changing create-gyral or its templates, and before a release (releasing.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TEMPLATES = ['basic', 'ssr'];
const dir = mkdtempSync(join(tmpdir(), 'gyral-create-'));
const tarballs = join(dir, 'tarballs');
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
// A user's shell, not pnpm's: drop the npm_config_* pnpm exports, which npm warns about.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_config_')),
);
const step = (cmd, args, cwd) => {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
};

/** Total and gzip size (KiB) of the JS files under `root`. */
function jsSize(root) {
  const files = readdirSync(root, { recursive: true }).filter((f) => String(f).endsWith('.js'));
  const bytes = files.map((f) => readFileSync(join(root, String(f))));
  const kib = (n) => (n / 1024).toFixed(1);
  const raw = bytes.reduce((sum, b) => sum + b.length, 0);
  const gz = bytes.reduce((sum, b) => sum + gzipSync(b, { level: 9 }).length, 0);
  return `${kib(raw)} KiB JS (${kib(gz)} KiB gzip) in ${String(files.length)} file(s)`;
}

const started = Date.now();
const results = [];
try {
  for (const pkg of readdirSync('packages')) {
    sh('pnpm', ['pack', '--pack-destination', tarballs], join('packages', pkg));
  }
  const tgz = Object.fromEntries(
    readdirSync(tarballs).map((file) => {
      const name = file.startsWith('gyral-')
        ? `@gyral/${file.replace(/^gyral-/, '').replace(/-\d.*$/, '')}`
        : file.replace(/-\d.*$/, '');
      return [name, join(tarballs, file)];
    }),
  );
  const cli = join(dir, 'create-gyral');
  mkdirSync(cli);
  sh('tar', ['-xzf', tgz['create-gyral'], '-C', cli]);

  for (const template of TEMPLATES) {
    console.log(`\n== ${template}`);
    const app = join(dir, `app-${template}`);
    step(
      'node',
      [join(cli, 'package', 'dist', 'cli.js'), app, '--template', template, '--yes'],
      dir,
    );

    // Agent instructions ship from the tarball too (gyral-7se.2).
    for (const file of ['AGENTS.md', 'CLAUDE.md']) {
      if (!readdirSync(app).includes(file)) throw new Error(`${template}: ${file} missing`);
    }

    // Point @gyral/* at the tarballs: direct dependencies, and overrides for the ones that
    // only arrive transitively (otherwise npm would fetch the registry's 0.0.0 placeholders).
    const manifestFile = join(app, 'package.json');
    const pkg = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const direct = new Set();
    for (const field of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(pkg[field])) {
        if (!name.startsWith('@gyral/')) continue;
        pkg[field][name] = `file:${tgz[name]}`;
        direct.add(name);
      }
    }
    pkg.overrides = Object.fromEntries(
      Object.entries(tgz)
        .filter(([name]) => name.startsWith('@gyral/') && !direct.has(name))
        .map(([name, file]) => [name, `file:${file}`]),
    );
    writeFileSync(manifestFile, JSON.stringify(pkg, null, 2));

    step('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], app);
    step('npm', ['run', 'typecheck'], app);
    step('npm', ['run', 'build'], app);
    step('npm', ['test'], app);
    if (template === 'ssr') {
      const html = readFileSync(join(app, 'dist', 'static', 'index.html'), 'utf8');
      if (!html.includes('<h1>Hello, Gyral</h1>') || !html.includes('shadowrootmode="open"')) {
        throw new Error('ssr: dist/static/index.html is not the prerendered home page');
      }
      // The installed @gyral/core's hydration chunk is found in the manifest (gyral-g1r.21).
      if (!/<link rel="modulepreload" href="\/assets\/hydration-client-[\w-]+\.js">/.test(html)) {
        throw new Error('ssr: the prerendered page does not preload the hydration chunk');
      }
    }
    const size = jsSize(join(app, 'dist', template === 'ssr' ? 'client' : ''));
    results.push(`${template}: typecheck, build, test ok; client build ${size}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\nverify:create ok in ${seconds}s`);
  for (const line of results) console.log(`  ${line}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

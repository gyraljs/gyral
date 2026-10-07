// pnpm pack:check — packs every package the way `pnpm publish` will (prepack build, publishConfig
// applied, workspace:* rewritten) and checks each tarball with publint, @arethetypeswrong/cli and
// content assertions. `npm pack --dry-run` must agree on the file list, so the `files` allowlist
// means the same thing to both tools.
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PUBLINT_TIMEOUT_MS = 120_000;

/**
 * publint's messages for a tarball, from a child process (lib/publint-child.mjs explains why):
 * resolved from the child's one line of JSON, after which the child is stopped, so neither its
 * exit nor a hang in it can keep this process alive.
 */
function publintMessages(tarball) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/lib/publint-child.mjs', tarball], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const done = (fn) => {
      clearTimeout(timer);
      child.kill('SIGKILL');
      fn();
    };
    const timer = setTimeout(() => {
      done(() => reject(new Error(`publint did not answer within ${PUBLINT_TIMEOUT_MS} ms`)));
    }, PUBLINT_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const line = stdout.indexOf('\n');
      if (line !== -1) done(() => resolve(JSON.parse(stdout.slice(0, line)).messages));
    });
    child.on('exit', (code) => {
      if (!stdout.includes('\n')) {
        done(() => reject(new Error(`publint exited ${String(code)} without output:\n${stderr}`)));
      }
    });
  });
}
const out = mkdtempSync(join(tmpdir(), 'gyral-pack-'));
const REQUIRED = ['package.json', 'README.md', 'LICENSE', 'NOTICE'];
const OPTIONAL = ['CHANGELOG.md']; // written by `changeset version`

/** Every file path an exports/imports map can resolve to. */
function targets(map) {
  if (typeof map === 'string') return [map];
  if (map === null || typeof map !== 'object') return [];
  return Object.values(map).flatMap(targets);
}

async function check(dir) {
  const problems = [];
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const { stdout } = await run(
    'pnpm',
    ['pack', '--pack-destination', join(out, manifest.name.replace('/', '+'))],
    {
      cwd: dir,
    },
  );
  const tarball = stdout.trim().split('\n').at(-1);
  const files = (await run('tar', ['-tzf', tarball])).stdout
    .trim()
    .split('\n')
    .map((f) => f.replace(/^package\//, ''))
    .sort();
  const packed = JSON.parse((await run('tar', ['-xzOf', tarball, 'package/package.json'])).stdout);

  for (const file of REQUIRED) if (!files.includes(file)) problems.push(`missing ${file}`);
  for (const file of files) {
    // create-gyral ships app templates (whose own tests are part of the generated app).
    if (manifest.name === 'create-gyral' && file.startsWith('templates/')) continue;
    if (![...REQUIRED, ...OPTIONAL].includes(file) && !file.startsWith('dist/'))
      problems.push(`unexpected file ${file}`);
    if (/\.test\.|(^|\/)test\//.test(file)) problems.push(`test file packed: ${file}`);
  }
  for (const bin of targets(packed.bin)) {
    const file = bin.replace(/^\.\//, '');
    if (!file.startsWith('dist/')) problems.push(`bin outside dist: ${bin}`);
    else if (!files.includes(file)) problems.push(`bin not in tarball: ${bin}`);
  }
  for (const target of [...targets(packed.exports), ...targets(packed.imports)]) {
    if (!target.startsWith('./dist/')) problems.push(`entry outside dist: ${target}`);
    else if (!files.includes(target.slice(2))) problems.push(`entry not in tarball: ${target}`);
  }
  if (JSON.stringify(packed).includes('workspace:'))
    problems.push('workspace: protocol left in package.json');

  const npm = JSON.parse(
    (await run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir })).stdout,
  );
  const npmFiles = npm[0].files.map((f) => f.path).sort();
  if (JSON.stringify(npmFiles) !== JSON.stringify(files)) {
    problems.push(`npm pack --dry-run lists different files:\n  ${npmFiles.join('\n  ')}`);
  }

  try {
    for (const message of await publintMessages(tarball)) problems.push(`publint: ${message}`);
  } catch (error) {
    problems.push(`publint: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await run('pnpm', [
      'exec',
      'attw',
      tarball,
      '--profile',
      'esm-only',
      '--format',
      'ascii',
      '--no-color',
    ]);
  } catch (error) {
    problems.push(`attw:\n${error.stdout}`);
  }

  const size = files.filter((f) => f.startsWith('dist/')).length;
  return { name: manifest.name, problems, summary: `${files.length} files (${size} in dist)` };
}

const dirs = readdirSync('packages').map((pkg) => join('packages', pkg));
const results = await Promise.all(dirs.map(check));
rmSync(out, { recursive: true, force: true });

let failed = false;
for (const { name, problems, summary } of results) {
  if (problems.length === 0) console.log(`ok   ${name}: ${summary}`);
  else {
    failed = true;
    console.error(`FAIL ${name}:\n  ${problems.join('\n  ')}`);
  }
}
process.exit(failed ? 1 : 0);

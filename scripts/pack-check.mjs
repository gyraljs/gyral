// pnpm pack:check — packs every package the way `pnpm publish` will (prepack build, publishConfig
// applied, workspace:* rewritten) and checks each tarball with publint, @arethetypeswrong/cli and
// content assertions. `npm pack --dry-run` must agree on the file list, so the `files` allowlist
// means the same thing to both tools.
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const run = promisify(execFile);
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
    if (![...REQUIRED, ...OPTIONAL].includes(file) && !file.startsWith('dist/'))
      problems.push(`unexpected file ${file}`);
    if (/\.test\.|(^|\/)test\//.test(file)) problems.push(`test file packed: ${file}`);
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

  const lint = await publint({
    pack: { tarball: readFileSync(tarball).buffer },
    level: 'suggestion',
    strict: true,
  });
  for (const message of lint.messages) problems.push(`publint: ${formatMessage(message, packed)}`);

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

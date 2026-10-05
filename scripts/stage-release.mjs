// Stages every @gyral package version that npm does not have yet (release.yml runs this).
// npm trusted publishing is configured stage-only: CI may `npm stage publish`, and the owner
// approves each staged version on npmjs.com with 2FA before it goes live
// (docs/references/releasing.md). `pnpm pack` builds the tarball exactly like `pnpm publish`
// would (prepack build, publishConfig applied, workspace:* rewritten); npm stages that tarball.
//
//   node scripts/stage-release.mjs            # dry run
//   node scripts/stage-release.mjs --stage    # stage (CI, with OIDC + provenance)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const stage = process.argv.includes('--stage');
const out = mkdtempSync(join(tmpdir(), 'gyral-stage-'));

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout;
}

/** True when npm already serves name@version (a staged, unapproved version is not live yet). */
function live(name, version) {
  const view = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json'], {
    encoding: 'utf8',
  });
  if (view.status === 0) return view.stdout.trim() !== '';
  if (/E404/.test(view.stderr)) return false;
  throw new Error(`npm view ${name}@${version} failed:\n${view.stderr}`);
}

const packages = readdirSync(join(root, 'packages'))
  .map((dir) => join(root, 'packages', dir))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }))
  .filter(({ manifest }) => manifest.private !== true);

const staged = [];
for (const { dir, manifest } of packages) {
  const spec = `${manifest.name}@${manifest.version}`;
  if (live(manifest.name, manifest.version)) {
    console.log(`skip    ${spec} (already on npm)`);
    continue;
  }
  const tarball = run('pnpm', ['pack', '--pack-destination', out], dir).trim().split('\n').at(-1);
  const args = ['stage', 'publish', tarball, '--access', 'public'];
  if (stage) args.push('--provenance');
  else args.push('--dry-run');
  console.log(`${stage ? 'stage  ' : 'dry-run'} ${spec}`);
  process.stdout.write(run('npm', args));
  staged.push(spec);
}

if (staged.length === 0) console.log('\nNothing to stage: every version is already on npm.');
else if (stage)
  console.log(`
Staged ${staged.length} package(s). Approve each one with 2FA before it goes live:
  https://www.npmjs.com/settings/gyral/packages → Staged Packages → Approve
  or locally: npm stage list <name> && npm stage approve <stage-id>`);

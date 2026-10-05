// Reserves every Gyral package name on npm with a 0.0.0 "coming soon" release, so trusted
// publishing (which needs an existing package) can be configured before the first real release.
// The owner runs this once, locally, after `npm login` (docs/references/releasing.md):
//
//   node scripts/publish-placeholders.mjs            # dry run: what would be published
//   node scripts/publish-placeholders.mjs --publish  # publish; npm asks for the 2FA code
//   node scripts/publish-placeholders.mjs --publish --otp=123456  # non-interactive shells
//
// Outside an interactive terminal npm cannot wait for the browser 2FA prompt (EOTP), so pass
// a fresh authenticator code with --otp; if it expires mid-run, re-run with a new one.
//
// Names that already exist on npm are skipped, so it is safe to re-run after a failure.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const base = join(root, 'release', 'placeholders');
const publish = process.argv.includes('--publish');
const otp = process.argv.find((arg) => arg.startsWith('--otp='));

/** release/placeholders/<name>/ and release/placeholders/@gyral/<name>/ */
const dirs = readdirSync(base).flatMap((entry) =>
  entry.startsWith('@')
    ? readdirSync(join(base, entry)).map((name) => join(base, entry, name))
    : [join(base, entry)],
);

function published(name) {
  const view = spawnSync('npm', ['view', name, 'version', '--json'], { encoding: 'utf8' });
  if (view.status === 0) return JSON.parse(view.stdout || 'null');
  if (/E404/.test(view.stderr)) return undefined;
  throw new Error(`npm view ${name} failed:\n${view.stderr}`);
}

if (publish) {
  const who = spawnSync('npm', ['whoami'], { encoding: 'utf8' });
  if (who.status !== 0) {
    console.error('Not logged in to npm. Run `npm login` first.');
    process.exit(1);
  }
  console.log(`Publishing as ${who.stdout.trim()}\n`);
}

const failed = [];
for (const dir of dirs) {
  const { name, version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const existing = published(name);
  if (existing !== undefined) {
    console.log(`skip     ${name} (already on npm at ${String(existing)})`);
    continue;
  }
  // Publish from a temp copy that carries the repo's LICENSE.
  const tmp = mkdtempSync(join(tmpdir(), 'gyral-placeholder-'));
  cpSync(dir, tmp, { recursive: true });
  copyFileSync(join(root, 'LICENSE'), join(tmp, 'LICENSE'));
  const args = [
    'publish',
    '--access',
    'public',
    ...(publish ? [] : ['--dry-run']),
    ...(publish && otp !== undefined ? [otp] : []),
  ];
  console.log(`${publish ? 'publish ' : 'dry-run '} ${name}@${version}`);
  const result = spawnSync('npm', args, { cwd: tmp, stdio: publish ? 'inherit' : 'ignore' });
  rmSync(tmp, { recursive: true, force: true });
  if (result.status !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.error(
    `\nFailed: ${failed.join(', ')}. Fix the cause and re-run; published names are skipped.`,
  );
  process.exit(1);
}
if (!publish) {
  console.log('\nDry run only. Re-run with --publish to publish (npm will ask for your 2FA code).');
  process.exit(0);
}

const scoped = dirs
  .map((dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name)
  .filter((name) => name.startsWith('@gyral/'));
console.log(`
Placeholders published. Now set up trusted publishing (docs/references/releasing.md):

  For each of: ${scoped.join(', ')}
    1. https://www.npmjs.com/package/<name>/access → Trusted Publisher → GitHub Actions
         Organization or user: gyraljs   Repository: gyral
         Workflow filename:    release.yml   Environment name: npm
         Allowed actions: leave "Allow npm publish" and "Allow npm dist-tag" UNCHECKED
         (stage-only: you approve every version on npmjs.com with 2FA)
    2. Same page → Publishing access → "Require two-factor authentication and disallow tokens"
  Unscoped placeholders (gyral, gyraljs, create-gyral): step 2 only, until they get real code.

  Then: GitHub → gyraljs/gyral → Settings → Environments → "npm" with yourself as a required
  reviewer, and branch/tag protection for main and v* tags.
`);

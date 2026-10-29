// Core as an exact-version peer (docs/design-docs/0033-core-peer.md): installs the packed
// @gyral/core and @gyral/http into a throwaway app, first at the same release, then with core
// repacked at another version. Either way the app must get exactly one copy of core; the
// mismatch must also make pnpm report the unmet peer, instead of installing a second core for
// @gyral/http as an ordinary dependency did. pnpm 11 and later only warn during the install
// and list the unmet peer under `pnpm peers check`.
import { execFile } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Core's and http's one registry dependency, linked from the workspace's install so the
// fixture needs no network and no registry metadata.
const SPEC = realpathSync('packages/core/node_modules/@standard-schema/spec');

// pnpm runs in the app with `--dir`, from the workspace root: corepack picks the version by the
// working directory, so the fixture runs the workspace's pnpm (packageManager), as CI does,
// rather than a machine's default. Pinning it in the app instead would make the offline install
// fetch pnpm's own metadata.
const pnpm = (app, args) => run('pnpm', ['--dir', app, ...args]);

/** `pnpm peers check` output (pnpm 11 and later); it exits 1 when it finds a problem. */
async function peersCheck(app) {
  try {
    const { stdout, stderr } = await pnpm(app, ['peers', 'check']);
    return stdout + stderr;
  } catch (error) {
    if (error?.code !== 1) throw error;
    return `${String(error.stdout)}${String(error.stderr)}`;
  }
}

/** `tarball` repacked with `version` in its package.json. */
async function repack(tarball, version, dir) {
  const work = join(dir, 'repack');
  mkdirSync(work);
  await run('tar', ['-xzf', tarball, '-C', work]);
  const file = join(work, 'package', 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...manifest, version }, null, 2));
  const out = join(dir, `core-${version}.tgz`);
  await run('tar', ['-czf', out, '-C', work, 'package']);
  return out;
}

/** Installs core and http; returns pnpm's output and the copies of core in the store. */
async function install(dir, core, http) {
  const app = join(dir, `app-${String(Date.now())}`);
  mkdirSync(app);
  const dependencies = { '@gyral/core': `file:${core}`, '@gyral/http': `file:${http}` };
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', dependencies }));
  // pnpm reads settings only from pnpm-workspace.yaml (since pnpm 11), not package.json.
  writeFileSync(
    join(app, 'pnpm-workspace.yaml'),
    `overrides:\n  '@standard-schema/spec': ${JSON.stringify(`link:${SPEC}`)}\n`,
  );
  const { stdout, stderr } = await pnpm(app, [
    'install',
    '--offline',
    '--ignore-scripts',
    '--config.minimumReleaseAge=0',
  ]);
  const copies = readdirSync(join(app, 'node_modules', '.pnpm')).filter((d) =>
    d.startsWith('@gyral+core@'),
  );
  return { output: stdout + stderr + (await peersCheck(app)), copies };
}

/** Problems with how core and http install together, matched and mismatched. */
export async function peerFixture(coreTarball, httpTarball) {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-peer-'));
  const problems = [];
  try {
    const matched = await install(dir, coreTarball, httpTarball);
    if (matched.copies.length !== 1)
      problems.push(`same release: ${String(matched.copies.length)} copies of core`);
    if (/unmet peer/i.test(matched.output))
      problems.push(`same release: pnpm reported an unmet peer:\n${matched.output}`);

    const other = await repack(coreTarball, '0.0.0-mismatch', dir);
    const mismatched = await install(dir, other, httpTarball);
    if (mismatched.copies.length !== 1)
      problems.push(`another release: ${String(mismatched.copies.length)} copies of core`);
    if (!/unmet peer @gyral\/core/i.test(mismatched.output))
      problems.push(`another release: pnpm did not report the unmet peer:\n${mismatched.output}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return problems;
}

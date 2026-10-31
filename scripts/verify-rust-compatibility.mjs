// The release-time Rust fixture (ADR 0034): gyral-rs's full checks of the pinned release's commit,
// run on this checkout's candidate @gyral/core and @gyral/ssr, not on gyral-rs's npm pins. Its
// own repository owns the Rust tests; this only points them at the candidate.
//   node scripts/verify-rust-compatibility.mjs /path/to/gyral-rs [--target-dir <dir>] [--keep]
// The checkout must be at the fixture's commit. It is only read: the pinned commit is exported
// into a throwaway copy (git archive), whose package.json takes the candidate tarballs; its
// native V8 archive is copied from the checkout's .local/v8 when there. --target-dir reuses a
// Cargo build directory (for example the checkout's `target`, an ignored directory). The
// per-PR `pnpm rust-compat` runs the released binary instead, with no Rust build.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  acceptance,
  candidateVersion,
  execute,
  packCandidate,
  readFixture,
} from './lib/rust-compat.mjs';

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'target-dir': { type: 'string' }, keep: { type: 'boolean', default: false } },
});
const [root] = positionals;
if (!root) {
  throw new Error(
    'Usage: node scripts/verify-rust-compatibility.mjs /path/to/gyral-rs [--target-dir <dir>] [--keep]',
  );
}
const checkout = resolve(root);
const fixture = await readFixture();
const version = await candidateVersion();
const refusal = acceptance(fixture, version);
if (refusal !== undefined) throw new Error(refusal);
const { stdout: head } = await execute('git', ['rev-parse', 'HEAD'], { cwd: checkout });
assert.equal(
  head.trim(),
  fixture.gyralRs.sourceCommit,
  "Check out the fixture's gyral-rs commit, or review a new release and pin it in the fixture",
);

const work = await mkdtemp(join(tmpdir(), 'gyral-rust-fixture-'));
const copy = join(work, 'gyral-rs');
const run = async (command, args, timeout = 1_800_000) => {
  const result = await execute(command, args, { cwd: copy, timeout, maxBuffer: 64 * 1024 * 1024 });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout.trim();
};
try {
  const tarballs = await packCandidate(join(work, 'tarballs'));
  await mkdir(copy);
  const archive = join(work, 'source.tar');
  await execute('git', ['archive', '--format=tar', '-o', archive, fixture.gyralRs.sourceCommit], {
    cwd: checkout,
  });
  await execute('tar', ['xf', archive, '-C', copy]);
  const v8 = join(checkout, '.local/v8');
  if (existsSync(v8)) await cp(v8, join(copy, '.local/v8'), { recursive: true });
  if (options['target-dir'] !== undefined) {
    await symlink(resolve(options['target-dir']), join(copy, 'target'), 'dir');
  }

  // The candidate in place of the exact npm pins; gyral-rs's lockfile pins everything else.
  const manifest = JSON.parse(await readFile(join(copy, 'package.json'), 'utf8'));
  for (const [name, file] of Object.entries(tarballs)) {
    assert.ok(manifest.dependencies?.[name], `gyral-rs's example depends on ${name}`);
    manifest.dependencies[name] = `file:${file}`;
  }
  await writeFile(join(copy, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await run('pnpm', ['install', '--no-frozen-lockfile']);
  await run('make', ['build']);
  const built = JSON.parse(
    await readFile(join(copy, 'examples/axum-app/dist/manifest.json'), 'utf8'),
  );
  assert.equal(built.abi, fixture.protocol, 'The manifest declares the fixture protocol');
  assert.equal(built.gyral, version, "The manifest names the candidate's release");
  await run('cargo', [
    'test',
    '--locked',
    '-p',
    'gyral-renderer',
    '--test',
    'gyral',
    '--test',
    'budgets',
  ]);
  await run(process.execPath, ['tools/artifact-smoke.mjs']);
  await run('pnpm', ['test:browser']);
  await run('pnpm', ['test:client-browser']);
  console.log(
    `Rust compatibility: Gyral candidate ${version} (protocol ${fixture.protocol}) passed ` +
      `gyral-rs ${fixture.gyralRs.version}'s fixture at ${fixture.gyralRs.sourceCommit.slice(0, 7)}.`,
  );
} finally {
  if (options.keep) console.log(`Kept ${work}`);
  else await rm(work, { recursive: true, force: true });
}

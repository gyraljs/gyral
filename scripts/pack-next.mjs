// Packs every package as a prerelease tarball for the apps (ADR 0018 "Migration"): nothing is
// published before 0.3.0. The version is rewritten inside the tarballs only, so pnpm's store
// never confuses them with the published 0.2.0.
//   pnpm pack:next                 → ../gyral-tarballs/<name>-0.3.0-next.0.tgz
//   pnpm pack:next 0.3.0-next.2    → another prerelease number
//   GYRAL_TARBALLS=/path pnpm pack:next
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const version = process.argv[2] ?? '0.3.0-next.0';
const out = resolve(process.env.GYRAL_TARBALLS ?? '../gyral-tarballs');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

/** Every @gyral/* (and create-gyral) dependency points at the same prerelease. */
function pin(deps) {
  if (deps === undefined) return deps;
  return Object.fromEntries(
    Object.entries(deps).map(([name, range]) => [
      name,
      name.startsWith('@gyral/') || name === 'create-gyral' ? version : range,
    ]),
  );
}

mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'gyral-pack-'));
const packed = [];
try {
  for (const pkg of readdirSync('packages')) {
    const dir = join('packages', pkg);
    const tarball = run('pnpm', ['pack', '--pack-destination', tmp], dir).split('\n').pop();
    const work = mkdtempSync(join(tmp, 'x-'));
    run('tar', ['-xzf', tarball, '-C', work]);
    const manifestPath = join(work, 'package', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = version;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      manifest[field] = pin(manifest[field]);
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const name = `${manifest.name.replace('@', '').replace('/', '-')}-${version}.tgz`;
    rmSync(join(out, name), { force: true });
    run('tar', ['-czf', join(out, name), '-C', work, 'package']);
    packed.push(name);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const commit = run('git', ['rev-parse', 'HEAD'], '.');
const dirty = run('git', ['status', '--porcelain'], '.') !== '';
writeFileSync(
  join(out, 'SOURCE.json'),
  `${JSON.stringify({ commit, dirty, version, packed: new Date().toISOString(), files: packed }, null, 2)}\n`,
);
console.log(`pack:next: ${String(packed.length)} tarballs (${version}) in ${out}`);

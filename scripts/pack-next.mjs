// Packs every package as a prerelease tarball, so apps can try unreleased changes without an npm
// prerelease (ADR 0018 "Migration" did this for 0.3.0). The version is rewritten inside the
// tarballs only, so pnpm's store never confuses them with a published version.
//   pnpm pack:next                 → ../gyral-tarballs/<name>-<next patch>-next.0.tgz
//                                    (core at 0.3.0 → 0.3.1-next.0)
//   pnpm pack:next 0.3.1-next.2    → another prerelease number
//   GYRAL_TARBALLS=/path pnpm pack:next
// Older prereleases' tarballs stay; @gyral/* entries in every dependency field (dev included)
// are pinned to the prerelease (lib/pack-next.mjs).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultPrerelease, prereleaseManifest } from './lib/pack-next.mjs';

const core = JSON.parse(readFileSync(join('packages', 'core', 'package.json'), 'utf8'));
const version = process.argv[2] ?? defaultPrerelease(core.version);
const out = resolve(process.env.GYRAL_TARBALLS ?? '../gyral-tarballs');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

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
    const manifest = prereleaseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), version);
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
const source = `${JSON.stringify({ commit, dirty, version, packed: new Date().toISOString(), files: packed }, null, 2)}\n`;
// SOURCE.json describes the latest pack; SOURCE-<version>.json stays with its tarballs.
writeFileSync(join(out, 'SOURCE.json'), source);
writeFileSync(join(out, `SOURCE-${version}.json`), source);
console.log(`pack:next: ${String(packed.length)} tarballs (${version}) in ${out}`);

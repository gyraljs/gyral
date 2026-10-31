// Shared by scripts/rust-compat.mjs (the per-PR job) and scripts/verify-rust-compatibility.mjs
// (the release fixture): the compatibility fixture, which Gyral releases the pinned gyral-rs
// release accepts (ADR 0034), packing this checkout's candidate packages, the pinned release
// archives, and running the released example binary.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

export const execute = promisify(execFile);
export const ROOT = join(import.meta.dirname, '..', '..');
export const FIXTURE = 'docs/references/rust-compatibility.json';

/** The fixture (schema 2: the protocol plus the pinned gyral-rs release), checked. */
export async function readFixture(root = ROOT) {
  const fixture = JSON.parse(await readFile(join(root, FIXTURE), 'utf8'));
  return checkFixture(fixture);
}

export function checkFixture(fixture) {
  assert.equal(fixture.schema, 2, `${FIXTURE}: schema 2 (ADR 0034)`);
  assert.ok(Number.isInteger(fixture.protocol) && fixture.protocol > 0, 'protocol: an integer');
  assert.ok(parseVersion(fixture.minGyral), 'minGyral: a MAJOR.MINOR.PATCH release');
  assert.match(fixture.apiHash, /^[a-f0-9]{64}$/, 'apiHash: a SHA-256');
  const rs = fixture.gyralRs;
  assert.ok(parseVersion(rs?.version), 'gyralRs.version: a MAJOR.MINOR.PATCH release');
  assert.match(rs.sourceCommit, /^[a-f0-9]{40}$/, 'gyralRs.sourceCommit: a full commit');
  assert.match(rs.repository, /^[\w.-]+\/[\w.-]+$/, 'gyralRs.repository: owner/name');
  for (const kind of ['source', 'binary']) {
    assert.match(rs.archives?.[kind]?.name ?? '', /^[\w.-]+\.tar\.gz$/, `${kind} archive name`);
    assert.match(rs.archives[kind].sha256, /^[a-f0-9]{64}$/, `${kind} archive SHA-256`);
  }
  if (rs.acceptsGyral !== undefined) assert.ok(parseVersion(rs.acceptsGyral), 'acceptsGyral');
  return fixture;
}

/** A strict `MAJOR.MINOR.PATCH` (no prerelease or build), as numbers; undefined otherwise. */
export function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(version));
  return match ? match.slice(1).map(Number) : undefined;
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Whether the pinned gyral-rs release accepts a Gyral `version` (ADR 0034 "How gyral-rs accepts
 * bundles"): a release, not a prerelease (decision 7), at or above the protocol's minimum. A
 * gyral-rs release from before the protocol (0.7.0 and older) records `acceptsGyral`, the one
 * release it accepts.
 */
export function acceptance(fixture, version) {
  const rs = `gyral-rs ${fixture.gyralRs.version}`;
  const parsed = parseVersion(version);
  if (parsed === undefined) {
    return `Gyral ${version} is not a MAJOR.MINOR.PATCH release: gyral-rs accepts no prerelease (ADR 0034, decision 7).`;
  }
  if (compare(parsed, parseVersion(fixture.minGyral)) < 0) {
    return `Gyral ${version} is below protocol ${fixture.protocol}'s minimum, ${fixture.minGyral}.`;
  }
  const exact = fixture.gyralRs.acceptsGyral;
  if (exact !== undefined && exact !== version) {
    return (
      `${rs} predates the SSR protocol (ADR 0034) and accepts only Gyral ${exact}; this ` +
      `candidate is ${version}. Pin a gyral-rs release that accepts protocol ${fixture.protocol} ` +
      `(0.8.0 or later) in ${FIXTURE}: its version, commit and archive digests, without ` +
      `"acceptsGyral". gyral-rs 0.8.0 ships before Gyral 0.3.10 (decision 8).`
    );
  }
  return undefined;
}

/** The candidate's version: `@gyral/core`'s and `@gyral/ssr`'s, which must agree. */
export async function candidateVersion(root = ROOT) {
  const read = async (name) =>
    JSON.parse(await readFile(join(root, 'packages', name, 'package.json'), 'utf8')).version;
  const [core, ssr] = await Promise.all([read('core'), read('ssr')]);
  assert.equal(ssr, core, '@gyral/core and @gyral/ssr must be at one version');
  return core;
}

/** Packs `@gyral/core` and `@gyral/ssr` from this checkout (prepack builds them). */
export async function packCandidate(destination, root = ROOT) {
  await mkdir(destination, { recursive: true });
  const tarballs = {};
  for (const name of ['core', 'ssr']) {
    const before = new Set(await readdir(destination));
    await execute('pnpm', ['pack', '--pack-destination', destination], {
      cwd: join(root, 'packages', name),
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const [file] = (await readdir(destination)).filter((f) => !before.has(f));
    assert.ok(file, `pnpm pack wrote no tarball for @gyral/${name}`);
    tarballs[`@gyral/${name}`] = join(destination, file);
  }
  return tarballs;
}

export const sha256 = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

/**
 * The pinned release's source and binary archives in `directory`, each checked against the
 * fixture's SHA-256: copied from `cache` when it holds them, downloaded from the GitHub release
 * otherwise.
 */
export async function releaseArchives(fixture, directory, cache) {
  const { repository, version, archives } = fixture.gyralRs;
  await mkdir(directory, { recursive: true });
  const files = {};
  for (const [kind, { name, sha256: expected }] of Object.entries(archives)) {
    const file = join(directory, name);
    const cached = cache === undefined ? [] : await readdir(cache).catch(() => []);
    if (cached.includes(name)) {
      await copyFile(join(cache, name), file);
    } else {
      const url = `https://github.com/${repository}/releases/download/v${version}/${name}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      assert.ok(response.ok, `${url}: HTTP ${response.status}`);
      await writeFile(file, new Uint8Array(await response.arrayBuffer()));
    }
    assert.equal(await sha256(file), expected, `${name}: SHA-256 differs from ${FIXTURE}`);
    files[kind] = file;
  }
  return files;
}

/**
 * Starts the released example binary on a free port and waits for its listening log line
 * (gyral-rs tools/example-process.mjs). `stop()` sends SIGTERM and expects a clean exit.
 */
export async function startExample(binary, dist) {
  const child = spawn(binary, [], {
    env: { ...process.env, GYRAL_EXAMPLE_BIND: '127.0.0.1:0', GYRAL_EXAMPLE_DIST: dist },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (bytes) => (output += bytes));
  child.stderr.on('data', (bytes) => (output += bytes));
  const exited = once(child, 'exit');
  let origin;
  for (let attempt = 0; attempt < 400 && origin === undefined; attempt += 1) {
    for (const line of output.split('\n')) {
      try {
        const log = JSON.parse(line);
        if (log.fields?.message === 'Gyral example listening') {
          origin = `http://${log.fields.address}`;
        }
      } catch {
        // A line may still be arriving.
      }
    }
    assert.equal(child.exitCode, null, `The example exited before listening:\n${output}`);
    if (origin === undefined) await delay(25);
  }
  assert.ok(origin, `The example did not start listening:\n${output}`);
  return {
    origin,
    output: () => output,
    async stop() {
      child.kill('SIGTERM');
      const result = await Promise.race([
        exited,
        delay(15_000).then(() => assert.fail(`The example did not drain:\n${output}`)),
      ]);
      assert.deepEqual(result, [0, null], `The example did not exit cleanly:\n${output}`);
    },
    async cleanup() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    },
  };
}

/** Runs the binary with `dist` and expects it to refuse startup (exit 1, never listening). */
export async function expectStartupFailure(binary, dist, what) {
  try {
    const { stdout } = await execute(binary, [], {
      env: { ...process.env, GYRAL_EXAMPLE_BIND: '127.0.0.1:0', GYRAL_EXAMPLE_DIST: dist },
      timeout: 15_000,
    });
    assert.fail(`${what}: the example started:\n${stdout}`);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.equal(error.code, 1, `${what} must fail startup with exit 1, not hang or crash`);
    assert.ok(!String(error.stdout).includes('Gyral example listening'), what);
  }
}

export const request = (origin, path) =>
  fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });

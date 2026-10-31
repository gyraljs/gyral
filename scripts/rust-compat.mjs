// pnpm rust-compat — the candidate in the pinned gyral-rs release binary (ADR 0034, the
// `rust-compat` job in ci.yml). It downloads the pinned release's source and Linux binary
// archives (checked against docs/references/rust-compatibility.json), packs @gyral/core and
// @gyral/ssr from this checkout, installs them into the extracted source with the esbuild
// gyral-rs pins, runs the example's own build (tools/build-example.mjs), and starts the released
// gyral-axum-example on that build, as gyral-rs's tools/release-smoke.mjs does. No Rust build.
// Linux x86_64 with glibc 2.38+, network for the archives and npm.
//   pnpm rust-compat [--archives <dir>] [--keep]
//     --archives  use the archives in <dir> when it holds them (still checked by SHA-256)
//     --keep      keep the work directory and print its path
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  acceptance,
  candidateVersion,
  execute,
  expectStartupFailure,
  packCandidate,
  readFixture,
  releaseArchives,
  request,
  startExample,
} from './lib/rust-compat.mjs';

const { values: options } = parseArgs({
  options: { archives: { type: 'string' }, keep: { type: 'boolean', default: false } },
});
const fixture = await readFixture();
const version = await candidateVersion();
const rs = fixture.gyralRs;
const refusal = acceptance(fixture, version);
if (refusal !== undefined) {
  console.error(`rust-compat: ${refusal}`);
  process.exit(1);
}
assert.equal(process.platform, 'linux', 'The gyral-rs release binary is Linux x86_64 only');
assert.equal(process.arch, 'x64', 'The gyral-rs release binary is Linux x86_64 only');

const work = await mkdtemp(join(tmpdir(), 'gyral-rust-compat-'));
const step = (text) => console.log(`rust-compat: ${text}`);
let example;
try {
  step(`gyral-rs ${rs.version} (${rs.sourceCommit.slice(0, 7)}), Gyral candidate ${version}`);
  const archives = await releaseArchives(
    fixture,
    join(work, 'archives'),
    options.archives && resolve(options.archives),
  );
  step('archives match the fixture');
  const tarballs = await packCandidate(join(work, 'tarballs'));
  step(`packed ${Object.values(tarballs).length} tarballs`);
  for (const [kind, file] of Object.entries(archives)) {
    await execute('mkdir', ['-p', join(work, kind)]);
    await execute('tar', ['xzf', file, '-C', join(work, kind)]);
  }
  const source = join(work, 'source', `gyral-rs-${rs.version}`);
  const binary = join(work, 'binary', `gyral-rs-${rs.version}`, 'gyral-axum-example');

  // The example's npm inputs, with the candidate in place of gyral-rs's exact Gyral pins.
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  const esbuild = manifest.devDependencies?.esbuild;
  assert.match(esbuild ?? '', /^\d+\.\d+\.\d+$/, 'gyral-rs pins esbuild exactly');
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'gyral-rs-examples',
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(
        Object.entries(tarballs).map(([name, file]) => [name, `file:${file}`]),
      ),
      devDependencies: { esbuild },
    }),
  );
  await execute(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'],
    { cwd: source, timeout: 300_000 },
  );
  step(`installed the candidate and esbuild ${esbuild}`);
  const built = await execute(process.execPath, ['tools/build-example.mjs'], {
    cwd: source,
    timeout: 120_000,
  });
  step(built.stdout.trim());
  const dist = join(source, 'examples/axum-app/dist');
  const bundle = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
  assert.equal(bundle.abi, fixture.protocol, 'The manifest declares the fixture protocol');
  assert.equal(bundle.gyral, version, "The manifest names the candidate's release");

  example = await startExample(binary, dist);
  assert.equal((await request(example.origin, '/readyz')).status, 200, '/readyz');
  const page = await request(example.origin, `/?name=${encodeURIComponent('<b>Ada & Bo</b>')}`);
  const html = await page.text();
  assert.equal(page.status, 200, `/ renders:\n${html}`);
  assert.ok(html.includes('Hello, &lt;b&gt;Ada &amp; Bo&lt;/b&gt;'), 'props are escaped');
  assert.ok(!html.includes('<b>Ada'), 'no raw props in the page');
  assert.ok(html.includes('shadowrootmode="open"'), 'components render as Declarative Shadow DOM');
  const policy = page.headers.get('content-security-policy') ?? '';
  assert.match(policy, /script-src 'sha256-/, 'the policy allows the client by hash');
  const client = await request(example.origin, bundle.client.path);
  assert.equal(client.status, 200, 'the hashed client asset is served');
  const failure = await request(example.origin, '/failure');
  const opaque = await failure.text();
  assert.equal(failure.status, 500, "onError: 'throw' becomes the host's 500");
  assert.ok(!opaque.includes('synthetic-private-render-diagnostic'), 'the 500 is opaque');
  await example.stop();
  example = undefined;
  step('the binary renders the candidate: /readyz, escaped props, CSP, client, opaque 500');

  for (const [what, corrupt] of [
    ['a tampered server digest', (dir) => writeFile(join(dir, 'server.js'), ' ', { flag: 'a' })],
    [
      `an unknown protocol (abi ${fixture.protocol + 1})`,
      (dir) =>
        writeFile(
          join(dir, 'manifest.json'),
          JSON.stringify({ ...bundle, abi: fixture.protocol + 1 }),
        ),
    ],
  ]) {
    const dir = join(work, what.replaceAll(/\W+/g, '-'));
    await cp(dist, dir, { recursive: true });
    await corrupt(dir);
    await expectStartupFailure(binary, dir, what);
    step(`${what} fails startup`);
  }
  console.log(
    `rust-compat: Gyral ${version} (protocol ${fixture.protocol}) passed in the gyral-rs ` +
      `${rs.version} release binary.`,
  );
} finally {
  if (example !== undefined) await example.cleanup();
  if (options.keep) console.log(`rust-compat: kept ${work}`);
  else await rm(work, { recursive: true, force: true });
}

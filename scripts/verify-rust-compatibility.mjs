// Coordination smoke check against a pinned consumer; its own repository owns Rust tests.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/verify-rust-compatibility.mjs /path/to/gyral-rs');
const fixture = JSON.parse(
  await readFile(new URL('../docs/references/rust-compatibility.json', import.meta.url), 'utf8'),
);
const cwd = resolve(root);
const run = async (command, args, timeout = 120_000) => {
  const result = await execute(command, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout.trim();
};
const revision = await run('git', ['rev-parse', 'HEAD']);
assert(
  revision.startsWith(fixture.sourceCommit),
  'Review a new source revision before changing the compatibility fixture',
);
const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
for (const [name, version] of Object.entries(fixture.npm))
  assert.equal(manifest.dependencies[name], version);
await run('pnpm', ['install', '--frozen-lockfile']);
await run('make', ['build']);
const built = JSON.parse(
  await readFile(resolve(cwd, 'examples/axum-app/dist/manifest.json'), 'utf8'),
);
assert.equal(built.abi, fixture.abi);
assert.equal(built.gyral, fixture.npm['@gyral/core']);
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
  `Rust compatibility: ABI ${fixture.abi}, exact npm ${fixture.npm['@gyral/core']} and ${revision} passed the reviewed fixture.`,
);

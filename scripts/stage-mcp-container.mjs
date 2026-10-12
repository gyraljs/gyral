// Stage an HTTP artifact; optionally keep its entire corpus on an exact published release.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const releasedVersion = args[0] === '--released-corpus' ? args[1] : undefined;
if (args.length !== 0 && (args.length !== 2 || !/^\d+\.\d+\.\d+$/.test(releasedVersion ?? '')))
  throw new Error('Usage: stage-mcp-container.mjs [--released-corpus X.Y.Z]');
const temp = mkdtempSync(join(tmpdir(), 'gyral-mcp-pack-'));
const output = join(root, 'deploy/mcp/gyral-mcp.tgz');
const metadata = join(root, 'deploy/mcp/artifact.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.status ?? result.error}`);
  return result.stdout?.trim();
}
function archive(directory) {
  const archives = readdirSync(directory).filter((f) => f.endsWith('.tgz'));
  if (archives.length !== 1) throw new Error('Expected one packed MCP artifact');
  return join(directory, archives[0]);
}
try {
  rmSync(output, { force: true });
  rmSync(metadata, { force: true });
  const source = join(temp, 'source');
  mkdirSync(source);
  run('pnpm', ['pack', '--pack-destination', temp], join(root, 'packages/mcp'));
  run('tar', ['-xzf', archive(temp), '-C', source]);
  let corpusSource = 'source';
  let registryIntegrity;
  if (releasedVersion !== undefined) {
    const released = join(temp, 'released');
    mkdirSync(released);
    const packed = JSON.parse(
      run(
        'npm',
        [
          'pack',
          `@gyral/mcp@${releasedVersion}`,
          '--ignore-scripts',
          '--json',
          '--registry=https://registry.npmjs.org',
          '--pack-destination',
          released,
        ],
        root,
        true,
      ),
    );
    if (packed.length !== 1 || packed[0].version !== releasedVersion)
      throw new Error('Registry artifact version mismatch');
    registryIntegrity = packed[0].integrity;
    run('tar', ['-xzf', archive(released), '-C', released]);
    copyFileSync(
      join(released, 'package/dist/corpus.json'),
      join(source, 'package/dist/corpus.json'),
    );
    corpusSource = `npm:@gyral/mcp@${releasedVersion}`;
  }
  const corpusBytes = readFileSync(join(source, 'package/dist/corpus.json'));
  const corpus = JSON.parse(corpusBytes);
  if (releasedVersion !== undefined && corpus.version !== releasedVersion)
    throw new Error('Published corpus version mismatch');
  run('tar', ['-czf', output, '-C', source, 'package']);
  const identity = {
    sourceRevision: run('git', ['rev-parse', 'HEAD'], root, true),
    corpusVersion: corpus.version,
    corpusSource,
    corpusSha256: hash(JSON.stringify(corpus)),
    corpusFileSha256: hash(corpusBytes),
    registryIntegrity,
    artifactSha256: hash(readFileSync(output)),
  };
  writeFileSync(metadata, `${JSON.stringify(identity, null, 2)}\n`);
  console.log(JSON.stringify(identity, null, 2));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

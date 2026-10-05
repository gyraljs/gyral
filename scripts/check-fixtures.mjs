// Runs after the tests in `pnpm check`: golden fixtures written by tests must be stable.
// If a test run changed a fixture, either the change is intended (review it, then `git add`
// the fixture) or the fixture contains per-run data (tokens, ids, dates) that must be pinned.
import { execFileSync } from 'node:child_process';

const changed = execFileSync(
  'git',
  [
    'diff',
    '--name-only',
    '--',
    ':(glob)packages/*/test/fixtures/**',
    ':(glob)examples/*/test/fixtures/**',
  ],
  { encoding: 'utf8' },
).trim();

if (changed !== '') {
  console.error(
    `Tests changed these fixtures:\n${changed}\n` +
      'If the markup change is intended, review the diff and `git add` the fixtures. If the ' +
      'fixture holds per-run data, pin it in the test that writes it.',
  );
  process.exit(1);
}
console.log('fixtures: unchanged by the test run');

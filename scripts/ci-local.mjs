// `pnpm ci:local`: runs .github/workflows/ci.yml in Docker with `gh act` (ADR 0004) and exits
// by the jobs' results, not act's exit code (see scripts/lib/act.mjs). Extra arguments are
// passed to act.
import { spawn } from 'node:child_process';
import { jobResults } from './lib/act.mjs';

const args = [
  'act',
  'workflow_dispatch',
  '-W',
  '.github/workflows/ci.yml',
  ...process.argv.slice(2),
];
const child = spawn('gh', args, { stdio: ['inherit', 'pipe', 'pipe'] });

let log = '';
const tee = (target) => (chunk) => {
  log += String(chunk);
  target.write(chunk);
};
child.stdout.on('data', tee(process.stdout));
child.stderr.on('data', tee(process.stderr));

child.on('close', (code) => {
  const result = jobResults(log);
  const note =
    result.ok && code !== 0 ? ` (act exited ${String(code)} after the jobs finished; ignored)` : '';
  console.log(`\nci:local: ${result.ok ? 'PASS' : 'FAIL'}: ${result.reason}${note}`);
  process.exit(result.ok ? 0 : 1);
});

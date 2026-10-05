import { describe, expect, it } from 'vitest';
import { jobResults } from '../lib/act.mjs';

const success = [
  '[ci/check] ⭐ Run Main pnpm check',
  '[ci/check]   ✅  Success - Main pnpm check [2m3s]',
  '[ci/check] 🏁  Job succeeded',
].join('\n');

describe('jobResults', () => {
  it('passes when every job succeeded, even if act then fails cleaning up', () => {
    const log = `${success}\nError: failed to remove container: context deadline exceeded`;
    expect(jobResults(log)).toMatchObject({ ok: true, jobs: { 'ci/check': 'succeeded' } });
  });

  it('fails when any job failed', () => {
    const log = `${success}\n[ci/build] 🏁  Job failed\nError: Job 'build' failed`;
    const result = jobResults(log);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('failed: ci/build');
  });

  it('fails when no job reported a result', () => {
    expect(jobResults('Error: Cannot connect to the Docker daemon').ok).toBe(false);
  });

  it('ignores the same words inside step output', () => {
    const log = `${success}\n[ci/check]   | echo "🏁  Job failed"`;
    expect(jobResults(log).ok).toBe(true);
  });
});

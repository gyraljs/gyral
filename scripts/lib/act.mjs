// Reads `gh act` output and decides the CI result from the jobs themselves (ADR 0004).
// act can exit non-zero after every job succeeded, for example when removing the container
// times out on a rootless Docker socket, so its exit code alone is not trustworthy.

const JOB_RESULT = /^\[([^\]]+)\]\s+🏁\s+Job (succeeded|failed)\b/u;

/**
 * Job results found in act's output, in order of completion.
 * @param {string} log
 * @returns {{ jobs: Record<string, 'succeeded' | 'failed'>, ok: boolean, reason: string }}
 */
export function jobResults(log) {
  /** @type {Record<string, 'succeeded' | 'failed'>} */
  const jobs = {};
  for (const line of log.split('\n')) {
    const match = JOB_RESULT.exec(line.trim());
    if (match?.[1] !== undefined && (match[2] === 'succeeded' || match[2] === 'failed')) {
      jobs[match[1]] = match[2];
    }
  }
  const names = Object.keys(jobs);
  if (names.length === 0) {
    return { jobs, ok: false, reason: 'no job reported a result (act failed before running?)' };
  }
  const failed = names.filter((name) => jobs[name] === 'failed');
  return failed.length === 0
    ? { jobs, ok: true, reason: `${String(names.length)} job(s) succeeded` }
    : { jobs, ok: false, reason: `failed: ${failed.join(', ')}` };
}

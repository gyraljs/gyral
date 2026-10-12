// Pure deterministic computation. The component never executes this on the main thread.
export interface SolveJob {
  readonly id: number;
  readonly iterations: number;
}
export interface SolveResult {
  readonly id: number;
  readonly checksum: number;
}
export function solve(job: SolveJob): SolveResult {
  if (!Number.isSafeInteger(job.iterations) || job.iterations < 0 || job.iterations > 5_000_000)
    throw new RangeError('Iterations must be between 0 and 5,000,000');
  let checksum = 0;
  for (let n = 0; n < job.iterations; n++) checksum = (checksum + Math.imul(n, 2654435761)) >>> 0;
  return { id: job.id, checksum };
}
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
export function isJob(value: unknown): value is SolveJob {
  return (
    record(value) &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    typeof value.iterations === 'number'
  );
}
export function isResult(value: unknown): value is SolveResult {
  return (
    record(value) &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    typeof value.checksum === 'number' &&
    Number.isSafeInteger(value.checksum) &&
    value.checksum >= 0
  );
}

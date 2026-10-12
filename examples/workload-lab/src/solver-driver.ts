import { defineDriver } from '@gyral/core';
import { isResult, record, type SolveJob, type SolveResult } from './solver-model.js';

export type WorkerPort = Pick<
  Worker,
  'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'
>;
const failure = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));
export function makeSolver(
  factory: () => WorkerPort = () =>
    new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }),
) {
  return defineDriver<SolveJob, SolveResult, string>({
    name: 'solver',
    concurrency: 'switch',
    toError: (cause) => (cause instanceof Error ? cause.message : String(cause)),
    run: (job, { signal }) => {
      if (signal.aborted) return Promise.reject(failure(signal.reason));
      const worker = factory();
      return new Promise<SolveResult>((resolve, reject) => {
        let ended = false;
        const finish = (result: SolveResult | undefined, error?: unknown): void => {
          if (ended) return;
          ended = true;
          worker.removeEventListener('message', message);
          worker.removeEventListener('error', failed);
          worker.removeEventListener('messageerror', failed);
          signal.removeEventListener('abort', aborted);
          worker.terminate();
          if (result !== undefined) resolve(result);
          else reject(failure(error));
        };
        const message = (event: MessageEvent<unknown>): void => {
          if (isResult(event.data)) {
            if (event.data.id === job.id) finish(event.data);
          } else
            finish(
              undefined,
              new Error(
                record(event.data) && typeof event.data.error === 'string'
                  ? event.data.error
                  : 'Malformed worker reply',
              ),
            );
        };
        const failed = (): void => {
          finish(undefined, new Error('Worker failed to execute or decode its reply'));
        };
        const aborted = (): void => {
          finish(undefined, signal.reason ?? new DOMException('Cancelled', 'AbortError'));
        };
        worker.addEventListener('message', message);
        worker.addEventListener('error', failed);
        worker.addEventListener('messageerror', failed);
        signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted) {
          aborted();
          return;
        }
        try {
          worker.postMessage(job);
        } catch (error) {
          finish(undefined, error);
        }
      });
    },
  });
}
export const solver = makeSolver();

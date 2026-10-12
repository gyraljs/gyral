import { command, define, html } from '@gyral/core';
import { solver } from './solver-driver.js';
import { controls } from './styles.js';

interface State {
  readonly job: number;
  readonly status: 'idle' | 'running' | 'done' | 'failed';
  readonly report: string;
}
type Msg =
  | { readonly _tag: 'Generate' }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Solved'; readonly job: number; readonly checksum: number }
  | { readonly _tag: 'Failed'; readonly job: number; readonly error: string };
export const Solver = define<State, Msg>()('gy-solver', {
  init: () => ({ job: 0, status: 'idle', report: 'Worker idle' }),
  intent: { Generate: true, Cancel: true },
  subscriptions: (s) =>
    s.status === 'running'
      ? [
          command(
            solver,
            { id: s.job, iterations: 300_000 },
            {
              key: 'solver:job',
              concurrency: 'switch',
              onSuccess: (result) => ({
                _tag: 'Solved',
                job: result.id,
                checksum: result.checksum,
              }),
              onFailure: (error) => ({ _tag: 'Failed', job: s.job, error }),
            },
          ),
        ]
      : [],
  update: {
    Generate: (s) => ({ ...s, job: s.job + 1, status: 'running', report: 'Worker running' }),
    Cancel: (s) => ({ ...s, status: 'idle', report: 'Worker cancelled' }),
    Solved: (s, m) =>
      s.status === 'running' && m.job === s.job
        ? { ...s, status: 'done', report: `Worker result: ${String(m.checksum)}` }
        : s,
    Failed: (s, m) =>
      s.status === 'running' && m.job === s.job ? { ...s, status: 'failed', report: m.error } : s,
  },
  view: (s, i) => html`
    <div class="actions">
      <button type="button" data-intent=${i.Generate}>Generate in worker</button>
      <button type="button" data-intent=${i.Cancel} ?disabled=${s.status !== 'running'}>
        Cancel worker
      </button>
    </div>
    <output aria-live="polite">${s.report}</output>
  `,
  styles: controls,
});

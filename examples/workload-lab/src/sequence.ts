import { define, html } from '@gyral/core';
import { delay } from '@gyral/time';
import { controls } from './styles.js';

export interface SequenceState {
  readonly run: number;
  readonly step: number;
  readonly playing: boolean;
  readonly notes: boolean;
}
export type SequenceMsg =
  | { readonly _tag: 'Start' }
  | { readonly _tag: 'Stop' }
  | { readonly _tag: 'Notes' }
  | { readonly _tag: 'Elapsed'; readonly run: number; readonly step: number };
export const durations = [1000, 1000, 1000] as const;

export const Sequence = define<SequenceState, SequenceMsg>()('gy-sequence', {
  init: () => ({ run: 0, step: 0, playing: false, notes: false }),
  intent: { Start: true, Stop: true, Notes: true },
  subscriptions: (s) =>
    s.playing
      ? [
          delay(
            durations[s.step] ?? 1000,
            { _tag: 'Elapsed', run: s.run, step: s.step },
            { key: `playback:${String(s.run)}:${String(s.step)}`, concurrency: 'switch' },
          ),
        ]
      : [],
  update: {
    Start: (s) => ({ ...s, run: s.run + 1, step: 0, playing: true }),
    Stop: (s) => ({ ...s, playing: false }),
    Notes: (s) => ({ ...s, notes: !s.notes }),
    Elapsed: (s, m) => {
      if (!s.playing || m.run !== s.run || m.step !== s.step) return s;
      const step = s.step + 1;
      return { ...s, step, playing: step < durations.length };
    },
  },
  view: (s, i) => html`
    <div class="actions">
      <button type="button" data-intent=${i.Start}>Start sequence</button>
      <button type="button" data-intent=${i.Stop} ?disabled=${!s.playing}>Stop sequence</button>
      <button type="button" data-intent=${i.Notes} aria-pressed=${s.notes}>
        Show playback notes
      </button>
    </div>
    <output aria-live="polite"
      >${s.playing ? `Step ${String(s.step + 1)} of ${String(durations.length)}` : s.step === durations.length ? 'Sequence complete' : 'Sequence stopped'}</output
    >
    ${s.notes ? html`<p>Each step owns a full one-second delay. True detach and reattach resumes the current step with a fresh full delay. A synchronous DOM move preserves the running timer.</p>` : null}
  `,
  styles: controls,
});

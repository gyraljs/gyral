import { css, define, emit, html } from '@gyral/core';

export interface SliderProps {
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
}

/** What the slider tells its parent (ADR 0010). */
export type SliderOutput = { readonly _tag: 'Changed'; readonly value: number };

type Msg = { readonly _tag: 'Changed'; readonly value: number };

/**
 * A reusable, *controlled* slider: the parent owns the value and passes it down as a prop;
 * the slider only reports changes up. It needs no model state of its own (Cycle's version kept
 * a local `value$` seeded from `props.initial`; here the parent's state is the single source).
 */
export const LabeledSlider = define<
  Readonly<Record<string, never>>,
  Msg,
  SliderProps,
  SliderOutput
>('gy-labeled-slider', {
  props: {
    label: { type: String },
    unit: { type: String },
    min: { type: Number },
    max: { type: Number },
    value: { type: Number },
  },
  init: () => ({}),
  intent: {
    Changed: ({ value }) => {
      const n = Number(value);
      return Number.isFinite(n) ? { _tag: 'Changed', value: n } : undefined;
    },
  },
  update: {
    // Props as context (ADR 0007): clamp to the bounds the parent configured.
    Changed: (s, m, { props }) => [
      s,
      [emit({ _tag: 'Changed', value: Math.min(props.max, Math.max(props.min, m.value)) })],
    ],
  },
  view: (_s, i, { props }) => html`
    <label for="slider">${props.label}</label>
    <input
      id="slider"
      type="range"
      min=${props.min}
      max=${props.max}
      .value=${String(props.value)}
      data-intent=${i.Changed}
    />
    <output for="slider">${props.value} ${props.unit}</output>
  `,
  styles: css`
    @layer component {
      :host {
        display: grid;
        grid-template-columns: 6rem 1fr 5rem;
        align-items: center;
        gap: 1rem;
        --accent: oklch(55% 0.18 160);
      }
      input {
        accent-color: var(--accent);
        inline-size: 100%;
      }
      output {
        font-variant-numeric: tabular-nums;
        text-align: end;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-labeled-slider': InstanceType<typeof LabeledSlider>;
  }
}

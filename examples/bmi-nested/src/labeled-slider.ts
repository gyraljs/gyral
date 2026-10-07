import { css, define, emit, html, prop, type Stateless } from '@gyral/core';

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
 * `value=` on an input is live form state (view/02-bindings.md "Live form state"): when the
 * parent's value changes, the render writes it to the input unless the input already shows it.
 * A render where the value is unchanged leaves the input as the user set it.
 */
export const LabeledSlider = define<Stateless, Msg, SliderProps, SliderOutput>(
  'gy-labeled-slider',
  {
    props: {
      label: prop.string({ required: true }),
      unit: prop.string({ required: true }),
      min: prop.number({ required: true }),
      max: prop.number({ required: true }),
      value: prop.number({ required: true }),
    },
    // Stateless: no init needed.
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
        value=${props.value}
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
          inline-size: 100%;
        }
        @supports (accent-color: var(--accent)) {
          input {
            accent-color: var(--accent);
          }
        }
        output {
          font-variant-numeric: tabular-nums;
          text-align: end;
        }
      }
    `,
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'gy-labeled-slider': InstanceType<typeof LabeledSlider>;
  }
}

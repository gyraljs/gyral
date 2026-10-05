import { css, define, field, html } from '@gyral/core';
import * as v from 'valibot';

export interface State {
  readonly weight: number;
  readonly height: number;
}

export type Msg =
  | { readonly _tag: 'Weight'; readonly kg: number }
  | { readonly _tag: 'Height'; readonly cm: number };

const WEIGHT = { min: 40, max: 140 } as const;
const HEIGHT = { min: 140, max: 210 } as const;

// Range inputs report strings; the schema parses and bounds them (ADR 0008).
const within = (range: { readonly min: number; readonly max: number }) =>
  v.pipe(
    v.string(),
    v.transform(Number),
    v.number(),
    v.integer(),
    v.minValue(range.min),
    v.maxValue(range.max),
  );

export const bmiOf = ({ weight, height }: State): number =>
  Math.round(weight / (height / 100) ** 2);

export const Bmi = define<State, Msg>('gy-bmi', {
  init: () => ({ weight: 70, height: 170 }),
  intent: {
    Weight: field(within(WEIGHT), (kg) => ({ _tag: 'Weight', kg })),
    Height: field(within(HEIGHT), (cm) => ({ _tag: 'Height', cm })),
  },
  update: {
    Weight: (s, m) => ({ ...s, weight: m.kg }),
    Height: (s, m) => ({ ...s, height: m.cm }),
  },
  view: (s, i) => html`
    <form>
      <p>
        <label for="weight">Weight</label>
        <input
          id="weight"
          name="weight"
          type="range"
          min=${WEIGHT.min}
          max=${WEIGHT.max}
          .value=${String(s.weight)}
          data-intent=${i.Weight}
        />
        <output for="weight">${s.weight} kg</output>
      </p>
      <p>
        <label for="height">Height</label>
        <input
          id="height"
          name="height"
          type="range"
          min=${HEIGHT.min}
          max=${HEIGHT.max}
          .value=${String(s.height)}
          data-intent=${i.Height}
        />
        <output for="height">${s.height} cm</output>
      </p>
    </form>
    <h2>BMI is <output>${bmiOf(s)}</output></h2>
    <meter min="10" max="40" low="18.5" high="25" optimum="21.7" .value=${bmiOf(s)}>
      ${bmiOf(s)}
    </meter>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 160);
      }
      p {
        display: grid;
        grid-template-columns: 6rem 1fr 5rem;
        align-items: center;
        gap: 1rem;
      }
      input[type='range'] {
        inline-size: 100%;
      }
      @supports (accent-color: var(--accent)) {
        input[type='range'] {
          accent-color: var(--accent);
        }
      }
      output {
        font-variant-numeric: tabular-nums;
        text-align: end;
      }
      meter {
        inline-size: 100%;
        block-size: 1rem;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-bmi': InstanceType<typeof Bmi>;
  }
}

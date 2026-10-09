import { child, css, define, html } from '@gyral/core';
import { LabeledSlider } from './labeled-slider.js';

export interface State {
  readonly weight: number;
  readonly height: number;
}

export type Msg =
  | { readonly _tag: 'Weight'; readonly kg: number }
  | { readonly _tag: 'Height'; readonly cm: number };

export const bmiOf = ({ weight, height }: State): number =>
  Math.round(weight / (height / 100) ** 2);

/**
 * The parent owns both values and derives the BMI. Each slider is the same child component;
 * the two `data-intent` names tell their outputs apart, with no extra scoping step.
 */
export const BmiNested = define<State, Msg>()('gy-bmi-nested', {
  init: () => ({ weight: 70, height: 170 }),
  intent: {
    Weight: child(LabeledSlider, (out) => ({ _tag: 'Weight', kg: out.value })),
    Height: child(LabeledSlider, (out) => ({ _tag: 'Height', cm: out.value })),
  },
  update: {
    Weight: (s, m) => ({ ...s, weight: m.kg }),
    Height: (s, m) => ({ ...s, height: m.cm }),
  },
  view: (s, i) => html`
    <gy-labeled-slider
      id="weight"
      label="Weight"
      unit="kg"
      min="40"
      max="140"
      .value=${s.weight}
      data-intent=${i.Weight}
    ></gy-labeled-slider>
    <gy-labeled-slider
      id="height"
      label="Height"
      unit="cm"
      min="140"
      max="210"
      .value=${s.height}
      data-intent=${i.Height}
    ></gy-labeled-slider>
    <h2>BMI is <output>${bmiOf(s)}</output></h2>
  `,
  styles: css`
    @layer component {
      :host {
        display: grid;
        gap: 1rem;
      }
      output {
        font-variant-numeric: tabular-nums;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-bmi-nested': InstanceType<typeof BmiNested>;
  }
}

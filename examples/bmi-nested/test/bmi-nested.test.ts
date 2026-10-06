import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run, step } from '@gyral/testing';
import { BmiNested, bmiOf } from '../src/bmi-nested.js';
import { LabeledSlider } from '../src/labeled-slider.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('pure', () => {
  it('parent derives BMI from the values its sliders report', () => {
    const { state } = run(BmiNested.spec, [
      { _tag: 'Weight', kg: 100 },
      { _tag: 'Height', cm: 200 },
    ]);
    expect(bmiOf(state)).toBe(25);
  });

  it('slider clamps to its props and emits Changed', () => {
    const props = { label: 'W', unit: 'kg', min: 40, max: 140, value: 70 };
    const { commands } = step(LabeledSlider.spec, {}, { _tag: 'Changed', value: 999 }, props);
    expect(commands.map((c) => c.input)).toEqual([{ _tag: 'Changed', value: 140 }]);
  });
});

describe('in the browser', () => {
  async function mount() {
    const el = new BmiNested();
    document.body.append(el);
    await settled();
    const slider = (id: string) => {
      const found = el.shadowRoot?.querySelector(`#${id}`);
      if (!(found instanceof LabeledSlider)) throw new Error(`no slider #${id}`);
      return found;
    };
    return { el, slider };
  }

  it('passes values down as props', async () => {
    const { slider } = await mount();
    const weight = slider('weight');
    await settled();
    expect(weight.value).toBe(70);
    expect(weight.min).toBe(40);
    expect(weight.shadowRoot?.querySelector('output')?.textContent).toBe('70 kg');
  });

  it('turns slider outputs into parent state and re-renders both levels', async () => {
    const { el, slider } = await mount();
    const height = slider('height');
    await settled();
    const input = height.shadowRoot?.querySelector('input');
    if (input == null) throw new Error('no input');
    input.value = '200';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    expect(el.state).toEqual({ weight: 70, height: 200 });
    expect(el.shadowRoot?.querySelector('h2 output')?.textContent).toBe('18');
    expect(height.shadowRoot?.querySelector('output')?.textContent).toBe('200 cm');
    expect(slider('weight').value).toBe(70);
  });
});

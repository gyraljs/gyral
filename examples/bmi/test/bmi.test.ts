import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { Bmi, bmiOf } from '../src/bmi.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('computes BMI from state', () => {
  expect(bmiOf({ weight: 70, height: 170 })).toBe(24);
});

it('updates from the sliders', async () => {
  const el = document.createElement('gy-bmi');
  document.body.append(el);
  await settled();
  const weight = el.shadowRoot?.querySelector<HTMLInputElement>('#weight');
  if (weight == null) throw new Error('no slider');
  weight.value = '100';
  weight.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await settled();
  expect(el.state).toEqual({ weight: 100, height: 170 });
  expect(el.shadowRoot?.querySelector('h2 output')?.textContent).toBe('35');
  expect(el.shadowRoot?.querySelector('meter')?.value).toBe(35);
});

it('rejects out-of-range input instead of storing it', async () => {
  const el = new Bmi();
  document.body.append(el);
  await settled();
  const height = el.shadowRoot?.querySelector<HTMLInputElement>('#height');
  if (height == null) throw new Error('no slider');
  // A tampered value: the schema, not the browser, is the last line of defense.
  height.type = 'text';
  height.value = '999';
  height.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await settled();
  expect(el.state.height).toBe(170);
});

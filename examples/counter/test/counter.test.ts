import { afterEach, expect, it } from 'vitest';
import { run, step } from '@gyral/testing';
import { Counter } from '../src/counter.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('update is pure and exhaustive', () => {
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Increment' }).state).toEqual({ count: 2 });
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Decrement' }).state).toEqual({ count: 0 });
  const { state } = run(Counter.spec, [
    { _tag: 'Increment' },
    { _tag: 'Increment' },
    { _tag: 'Decrement' },
  ]);
  expect(state.count).toBe(1);
});

it('counts clicks', async () => {
  const el = document.createElement('gy-counter');
  document.body.append(el);
  await el.updateComplete;
  const [dec, inc] = el.shadowRoot?.querySelectorAll('button') ?? [];
  inc?.click();
  inc?.click();
  dec?.click();
  await el.updateComplete;
  expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('1');
});

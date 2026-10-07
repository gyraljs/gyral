import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run, step } from '@gyral/testing';
import { Counter } from './counter.js';

afterEach(() => {
  document.body.replaceChildren();
});

// The update is pure: test it without rendering anything.
it('counts up and down', () => {
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Increment' }).state).toEqual({ count: 2 });
  const { state } = run(Counter.spec, [
    { _tag: 'Increment' },
    { _tag: 'Increment' },
    { _tag: 'Decrement' },
  ]);
  expect(state.count).toBe(1);
});

// The component itself, in a real browser.
it('counts clicks', async () => {
  const el = document.createElement('app-counter');
  document.body.append(el);
  await settled();
  const [decrement, increment] = el.shadowRoot?.querySelectorAll('button') ?? [];
  increment?.click();
  increment?.click();
  decrement?.click();
  await settled();
  expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('1');
});

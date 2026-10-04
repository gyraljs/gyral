import { afterEach, expect, it } from 'vitest';
import { Counter } from '../src/counter.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('update is pure and exhaustive', () => {
  const { update } = Counter.spec;
  expect(update.Increment({ count: 1 }, { _tag: 'Increment' })).toEqual({ count: 2 });
  expect(update.Decrement({ count: 1 }, { _tag: 'Decrement' })).toEqual({ count: 0 });
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

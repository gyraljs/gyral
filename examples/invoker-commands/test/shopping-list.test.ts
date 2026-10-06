import { run } from '@gyral/testing';
import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { ShoppingList } from '../src/shopping-list.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('applies commands purely', () => {
  const { state } = run(ShoppingList.spec, [
    { _tag: 'Command', command: '--add' },
    { _tag: 'Command', command: '--clear' },
    { _tag: 'Command', command: '--add' },
  ]);
  expect(state).toEqual({ items: ['Item 2'], next: 3 });
});

it('adds and clears through invoker buttons, and opens the help dialog natively', async () => {
  const el = document.createElement('gy-shopping-list');
  document.body.append(el);
  await settled();
  const button = (name: string) =>
    [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find((b) => b.textContent === name);
  button('Add item')?.click();
  await settled();
  expect(el.shadowRoot?.querySelector('h2')?.textContent).toBe('List (3)');
  button('Clear')?.click();
  await settled();
  expect(el.state.items).toEqual([]);
  button('Help')?.click();
  expect(el.shadowRoot?.querySelector('dialog')?.open).toBe(true);
});

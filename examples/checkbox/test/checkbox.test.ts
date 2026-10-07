import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run } from '@gyral/testing';
import { Checkbox } from '../src/checkbox.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('update follows the checked state', () => {
  const { state } = run(Checkbox.spec, [
    { _tag: 'Toggled', on: true },
    { _tag: 'Toggled', on: false },
    { _tag: 'Toggled', on: true },
  ]);
  expect(state).toEqual({ on: true });
});

it('shows ON while checked and off otherwise', async () => {
  const el = document.createElement('gy-checkbox');
  document.body.append(el);
  await settled();
  const output = () => el.shadowRoot?.querySelector('output')?.textContent;
  const box = el.shadowRoot?.querySelector('input');
  if (box == null) throw new Error('missing checkbox');
  expect(output()).toBe('off');
  box.click();
  await settled();
  expect(output()).toBe('ON');
  expect(el.state.on).toBe(true);
  box.click();
  await settled();
  expect(output()).toBe('off');
  expect(el.shadowRoot?.querySelector('label')?.htmlFor).toBe(box.id);
});

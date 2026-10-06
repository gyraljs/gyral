import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { Hello } from '../src/hello.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('update stores the typed name', () => {
  const ctx = {
    props: {},
    read: () => {
      throw new Error('no stores here');
    },
  };
  const next = Hello.spec.update.Named({ name: '' }, { _tag: 'Named', name: 'Ada' }, ctx);
  expect(next).toEqual({ name: 'Ada' });
});

it('greets whatever is typed', async () => {
  const el = document.createElement('gy-hello');
  document.body.append(el);
  await settled();
  const output = () => el.shadowRoot?.querySelector('output')?.textContent;
  expect(output()).toBe('Hello ');
  const input = el.shadowRoot?.querySelector('input');
  if (input == null) throw new Error('missing input');
  input.value = 'Ada';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await settled();
  expect(output()).toBe('Hello Ada');
  expect(el.shadowRoot?.querySelector('label')?.htmlFor).toBe(input.id);
});

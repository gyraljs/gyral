import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run } from '@gyral/testing';
import { fullName, HelloLastname } from '../src/hello-lastname.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('fullName', () => {
  it('formats LAST, First once both parts are valid', () => {
    expect(fullName({ first: 'Ada', last: 'Lovelace' })).toBe('LOVELACE, Ada');
  });

  it('stays empty until the last name has three letters and a first name exists', () => {
    expect(fullName({ first: 'Ada', last: 'Lo' })).toBe('');
    expect(fullName({ first: '', last: 'Lovelace' })).toBe('');
  });
});

it('update stores each field', () => {
  const { state } = run(HelloLastname.spec, [
    { _tag: 'First', value: 'Ada' },
    { _tag: 'Last', value: 'Byron' },
    { _tag: 'Last', value: 'Lovelace' },
  ]);
  expect(state).toEqual({ first: 'Ada', last: 'Lovelace' });
});

it('greets once both inputs are valid', async () => {
  const el = document.createElement('gy-hello-lastname');
  document.body.append(el);
  await settled();
  const type = async (id: string, value: string) => {
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
    if (input == null) throw new Error(`missing #${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
  };
  const greeting = () => el.shadowRoot?.querySelector('output')?.textContent;
  await type('first', 'Ada');
  await type('last', 'Lo');
  expect(greeting()).toBe('Hello ');
  await type('last', 'Lovelace');
  expect(greeting()).toBe('Hello LOVELACE, Ada');
});

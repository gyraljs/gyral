import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run } from '@gyral/testing';
import { greeting, Hello } from '../src/hello.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('greeting', () => {
  it('is the first name, or LAST, First when formal and the last name is valid', () => {
    expect(greeting({ first: ' Ada ', last: '', formal: false })).toBe('Ada');
    expect(greeting({ first: 'Ada', last: 'Lovelace', formal: true })).toBe('LOVELACE, Ada');
    expect(greeting({ first: 'Ada', last: 'Lo', formal: true })).toBe('Ada');
  });
});

it('update stores each field and the checkbox', () => {
  const { state } = run(Hello.spec, [
    { _tag: 'First', value: 'Ada' },
    { _tag: 'Last', value: 'Byron' },
    { _tag: 'Last', value: 'Lovelace' },
    { _tag: 'Formal', on: true },
  ]);
  expect(state).toEqual({ first: 'Ada', last: 'Lovelace', formal: true });
});

it('greets as you type, formally once the box is checked', async () => {
  const el = document.createElement('gy-hello');
  document.body.append(el);
  await settled();
  const root = el.shadowRoot;
  const output = () => root?.querySelector('output')?.textContent;
  const type = async (id: string, value: string) => {
    const input = root?.querySelector<HTMLInputElement>(`#${id}`);
    if (input == null) throw new Error(`missing #${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
  };
  expect(output()).toBe('Hello ');
  await type('first', 'Ada');
  expect(output()).toBe('Hello Ada');
  await type('last', 'Lovelace');
  root?.querySelector<HTMLInputElement>('#formal')?.click();
  await settled();
  expect(output()).toBe('Hello LOVELACE, Ada');
  for (const label of root?.querySelectorAll('label') ?? []) {
    expect(root?.getElementById(label.htmlFor)).not.toBeNull();
  }
});

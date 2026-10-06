import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import serverHtml from './fixtures/invalid.ssr.html?raw';

interface Live extends HTMLElement {
  readonly state: { readonly saves: number };
  send(msg: { readonly _tag: string }): void;
}

let page: MountedSsr;
let serverInput: Element | null | undefined;
const host = (): Live => {
  const el = document.querySelector('test-invalid-form');
  if (!(el instanceof HTMLElement)) throw new Error('no host');
  return el as Live;
};
const field = (): HTMLInputElement => {
  const el = host().shadowRoot?.querySelector('input');
  if (!(el instanceof HTMLInputElement)) throw new Error('no input');
  return el;
};
const form = (): HTMLFormElement => {
  const el = host().shadowRoot?.querySelector('form');
  if (!(el instanceof HTMLFormElement)) throw new Error('no form');
  return el;
};
const settle = () => new Promise((r) => setTimeout(r, 10));
const reject = async () => {
  host().send({ _tag: 'Reject' });
  await settled();
  expect(field().validity.customError).toBe(true);
};

beforeAll(async () => {
  page = mountSsr(serverHtml);
  serverInput = document.querySelector('test-invalid-form')?.shadowRoot?.querySelector('input');
  await import('./support/invalid.js');
  await hydrated(page);
});

afterAll(() => {
  page.unmount();
});

describe('invalid() after hydration', () => {
  it('applies the model error to native validity once hydrated, on the server input', () => {
    expect(field()).toBe(serverInput);
    expect(field().validationMessage).toBe('Email is taken');
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  it('clears on change as well as input', async () => {
    field().dispatchEvent(new Event('change', { bubbles: true }));
    expect(field().validity.valid).toBe(true);
    expect(field().hasAttribute('aria-invalid')).toBe(false);
    await reject();
    field().dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(field().validity.valid).toBe(true);
  });

  it('clears when the model clears the error', async () => {
    await reject();
    host().send({ _tag: 'Clear' });
    await settled();
    expect(field().validity.valid).toBe(true);
    expect(field().hasAttribute('aria-invalid')).toBe(false);
  });

  it('keeps the error while the rejected value is unchanged', async () => {
    await reject();
    const before = host().state.saves;
    form().requestSubmit();
    await settle();
    expect(host().state.saves).toBe(before);
    expect(field().validity.customError).toBe(true);
  });

  it('drops a stale error when the value changed from code, and submits again once', async () => {
    await reject();
    const before = host().state.saves;
    field().value = 'free@example.com'; // no input/change event
    form().requestSubmit(); // blocked by the stale error, then resubmitted once
    await settle();
    expect(host().state.saves).toBe(before + 1);
    expect(field().validity.valid).toBe(true);
  });
});

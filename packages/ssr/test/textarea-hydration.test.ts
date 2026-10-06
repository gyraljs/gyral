import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import serverHtml from './fixtures/textarea.ssr.html?raw';

interface Live extends HTMLElement {
  readonly state: { readonly message: string; readonly invalid: boolean };
  send(msg: { readonly _tag: string }): void;
}

let page: MountedSsr;
let before: HTMLTextAreaElement;
const host = (): Live => {
  const el = document.querySelector('test-note');
  if (!(el instanceof HTMLElement)) throw new Error('no host');
  return el as Live;
};
const area = (): HTMLTextAreaElement => {
  const el = host().shadowRoot?.querySelector('textarea');
  if (!(el instanceof HTMLTextAreaElement)) throw new Error('no textarea');
  return el;
};

beforeAll(async () => {
  page = mountSsr(serverHtml);
  before = area();
  before.value = 'typed before hydration';
  await import('./support/textarea.js');
  await hydrated(page);
});

afterAll(() => {
  page.unmount();
});

describe('<textarea> hydration (gyral-czi.34)', () => {
  it('hydrates in place and keeps what was typed before the script loaded', () => {
    expect(area()).toBe(before);
    expect(area().value).toBe('typed before hydration');
  });

  it('turns typing into intents and model changes into the live value', async () => {
    area().value = 'new text';
    area().dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    expect(host().state.message).toBe('new text');
    expect(area()).toBe(before);
    host().shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(area().value).toBe('');
    expect(area()).toBe(before);
  });

  it('keeps attributes in sync', async () => {
    host().send({ _tag: 'Flag' });
    await settled();
    expect(area().getAttribute('aria-invalid')).toBe('true');
    host().send({ _tag: 'Flag' });
    await settled();
    expect(area().hasAttribute('aria-invalid')).toBe(false);
  });
});

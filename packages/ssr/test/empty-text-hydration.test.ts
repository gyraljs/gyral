// ORDER IS LOAD-BEARING: hydrate support before anything that imports `lit` (ADR 0012).
import '../src/hydrate.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import serverHtml from './fixtures/empty-text.ssr.html?raw';

interface Live extends HTMLElement {
  send(msg: { _tag: 'Say'; text: string }): void;
  readonly updateComplete: Promise<boolean>;
}

let page: MountedSsr | undefined;

const el = (tag: string): Live => {
  const found = document.querySelector(tag);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${tag}`);
  return found as Live;
};
const text = (tag: string, sel: string): string | undefined =>
  (el(tag).shadowRoot ?? el(tag)).querySelector(sel)?.textContent.trim();

beforeAll(async () => {
  page = mountSsr(serverHtml);
  await import('./support/empty-text.js');
  await hydrated(page);
});

afterAll(() => {
  page?.unmount();
});

describe("a text binding rendered from '' on the server (gyral-4k7.12)", () => {
  it('shows content set after hydration (shadow DOM)', async () => {
    el('test-empty-text').send({ _tag: 'Say', text: 'Hello' });
    await el('test-empty-text').updateComplete;
    expect(text('test-empty-text', '.msg')).toBe('Hello');
    expect(text('test-empty-text', '.mixed')).toBe('Note: Hello!');
  });

  it('keeps the closing marker intact and survives cycling back to empty', async () => {
    const host = el('test-empty-text');
    const msg = host.shadowRoot?.querySelector('.msg');
    const comments = [...(msg?.childNodes ?? [])].filter((n) => n instanceof Comment);
    expect(comments.map((c) => c.data)).toEqual(['lit-part', '/lit-part']);
    for (const text of ['', 'Again', '']) {
      host.send({ _tag: 'Say', text });
      await host.updateComplete;
      expect(msg?.textContent.trim()).toBe(text);
    }
  });

  it('shows content set after hydration (light DOM)', async () => {
    el('test-empty-light').send({ _tag: 'Say', text: 'Hi' });
    await el('test-empty-light').updateComplete;
    expect(text('test-empty-light', '.msg')).toBe('Hi');
  });
});

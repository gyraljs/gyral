import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { settled } from '@gyral/core';
import serverHtml from './fixtures/islands.ssr.html?raw';

interface Live extends HTMLElement {
  readonly state: Record<string, unknown>;
}

let page: MountedSsr | undefined;
const nodesBefore = new Map<string, Element>();

const el = (selector: string): Live => {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`);
  return found as Live;
};
const button = (selector: string): HTMLButtonElement => {
  const found = el(selector).shadowRoot?.querySelector('button');
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no button in ${selector}`);
  return found;
};
const deferred = (selector: string): boolean => el(selector).hasAttribute('defer-hydration');

beforeAll(async () => {
  page = mountSsr(serverHtml);
  for (const tag of ['load', 'idle', 'visible', 'interaction']) {
    nodesBefore.set(tag, button(`test-island-${tag}`));
  }
  await import('./support/islands.js');
  await hydrated(page); // waits for the eager components; pending islands are skipped
});

afterAll(() => {
  page?.unmount();
});

describe('lazy hydration islands (gyral-4k7.4)', () => {
  it('hydrates load components right away and keeps islands inert', () => {
    expect(el('test-island-load').state['hydrated']).toBe(true);
    expect(deferred('test-island-visible')).toBe(true);
    expect(deferred('test-island-interaction')).toBe(true);
    button('test-island-interaction').click(); // nothing listens yet
    expect(el('test-island-interaction').state['count']).toBe(0);
  });

  it('hydrates idle islands in place once the browser is idle, with their store', async () => {
    // requestIdleCallback may wait up to its 2 s timeout on a busy machine.
    await vi.waitFor(
      () => {
        expect(deferred('test-island-idle')).toBe(false);
      },
      { timeout: 5000 },
    );
    await settled();
    expect(button('test-island-idle')).toBe(nodesBefore.get('idle'));
    button('test-island-idle').click();
    await settled();
    expect(el('test-island-idle').state['count']).toBe(1);
    await settled();
    expect(el('test-island-store').shadowRoot?.querySelector('output')?.textContent).toBe('41');
  });

  it('hydrates interaction islands on first pointer contact, before the click lands', async () => {
    const target = button('test-island-interaction');
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
    await settled();
    expect(deferred('test-island-interaction')).toBe(false);
    expect(button('test-island-interaction')).toBe(nodesBefore.get('interaction'));
    target.click();
    await settled();
    expect(el('test-island-interaction').state['count']).toBe(1);
  });

  it('hydrates a component nested in a pending island on its own (07: no parent order)', async () => {
    const parent = el('test-island-parent');
    expect(deferred('test-island-parent')).toBe(true);
    const nested = parent.shadowRoot?.querySelector('test-island-load') as Live | null;
    expect(nested?.state['hydrated']).toBe(true);
    const p = parent.shadowRoot?.querySelector('p');
    parent.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await settled();
    expect(deferred('test-island-parent')).toBe(false);
    expect(parent.shadowRoot?.querySelector('p')).toBe(p);
    expect(parent.shadowRoot?.querySelector('test-island-load')).toBe(nested);
  });

  it('keeps an island inside a hydrated component deferred: islands sit anywhere', async () => {
    const host = el('test-island-host');
    expect(host.state['n']).toBe(1);
    const inner = host.shadowRoot?.querySelector<Live>('test-island-interaction');
    if (inner == null) throw new Error('no inner island');
    expect(inner.hasAttribute('defer-hydration')).toBe(true); // the host's walk left it alone
    const innerButton = inner.shadowRoot?.querySelector('button');
    innerButton?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
    await settled();
    expect(inner.hasAttribute('defer-hydration')).toBe(false);
    expect(inner.shadowRoot?.querySelector('button')).toBe(innerButton);
    innerButton?.click();
    await settled();
    expect(inner.state['count']).toBe(1);
  });

  it('hydrates visible islands when they scroll into view', async () => {
    expect(deferred('test-island-visible')).toBe(true);
    el('test-island-visible').scrollIntoView();
    await vi.waitFor(() => {
      expect(deferred('test-island-visible')).toBe(false);
    });
    await settled();
    expect(button('test-island-visible')).toBe(nodesBefore.get('visible'));
    expect(page?.problems).toEqual([]);
  });
});

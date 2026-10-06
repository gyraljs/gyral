// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
// ORDER IS DELIBERATELY WRONG (gyral-czi.41): Lit (through @gyral/testing → @gyral/core) loads
// BEFORE `@gyral/ssr/hydrate`, the way a bundler that moves shared code into an earlier chunk
// evaluates it (seen in gyral-shop's production build). Lit's own hydrate support then never
// patches LitElement, so Gyral must still hydrate server-rendered shadow roots in place.
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import '../src/hydrate.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from './fixtures/nested.ssr.html?raw';

let page: MountedSsr | undefined;
const errors = vi.spyOn(console, 'error');
const uncaught: unknown[] = [];
window.addEventListener('error', (event) => {
  uncaught.push(event.error);
  event.preventDefault();
});

interface Live extends HTMLElement {
  readonly state: Record<string, unknown>;
}

const parent = (): Live => {
  const el = document.querySelector('test-nest-parent');
  if (!(el instanceof HTMLElement)) throw new Error('no parent');
  return el as Live;
};
const nested = (): Live => {
  const el = parent().shadowRoot?.querySelector('test-nest-child');
  if (!(el instanceof HTMLElement)) throw new Error('no child');
  return el as Live;
};
/** Element children of a shadow root, ignoring <style>: one rendered view, not two. */
const viewNodes = (el: Element): Element[] =>
  [...(el.shadowRoot?.children ?? [])].filter((c) => c.localName !== 'style');
const settle = () => new Promise((r) => setTimeout(r, 20));

let parentBefore: Element[] = [];
let childBefore: Element[] = [];

beforeAll(async () => {
  page = mountSsr(serverHtml);
  parentBefore = viewNodes(parent());
  childBefore = viewNodes(nested());
  await import('./support/nested.js');
  await hydrated(page);
  await settle();
});

afterAll(() => {
  page?.unmount();
});

describe('hydration when Lit loaded before @gyral/ssr/hydrate', () => {
  it('was really set up wrong: LitElement is not patched by Lit hydrate support', async () => {
    const { LitElement } = await import('lit');
    expect(Object.prototype.hasOwnProperty.call(LitElement, 'observedAttributes')).toBe(false);
  });

  it('hydrates shadow roots in place: one view, the same nodes', () => {
    expect(parentBefore.length).toBeGreaterThan(0);
    expect(viewNodes(parent())).toEqual(parentBefore);
    expect(viewNodes(nested())).toEqual(childBefore);
    for (const [i, node] of parentBefore.entries()) expect(viewNodes(parent())[i]).toBe(node);
    for (const [i, node] of childBefore.entries()) expect(viewNodes(nested())[i]).toBe(node);
  });

  it('wires intents and updates in place', async () => {
    nested().shadowRoot?.querySelector<HTMLButtonElement>('.inc')?.click();
    await settle();
    expect(nested().state['count']).toBe(1);
    expect(viewNodes(nested())).toHaveLength(childBefore.length);
    expect(errors).not.toHaveBeenCalled();
    expect(uncaught).toEqual([]);
  });
});

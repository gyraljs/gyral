import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from './fixtures/nested.ssr.html?raw';

let page: MountedSsr | undefined;
let before:
  | {
      child: Element;
      childButton: Element | null | undefined;
      parentButton: Element | null | undefined;
    }
  | undefined;

const errors = vi.spyOn(console, 'error');
// Errors thrown from custom element callbacks (upgrade, connect) are reported here.
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
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeAll(async () => {
  page = mountSsr(serverHtml);
  // Nested components are not deferred: each hydrates on its own (view/07-hydration.md).
  const child = nested();
  expect(child.hasAttribute('defer-hydration')).toBe(false);
  before = {
    child,
    childButton: child.shadowRoot?.querySelector('button'),
    parentButton: parent().shadowRoot?.querySelector('button'),
  };
  await import('./support/nested.js'); // upgrade: parent and child hydrate, parents first
  await hydrated(page); // waits for the nested child too; fails on mismatches/errors
  await settle();
});

afterAll(() => {
  page?.unmount();
});

describe('a Gyral child server-rendered inside a parent shadow root', () => {
  it('hydrates both in place without errors: the server nodes are kept', () => {
    expect(nested()).toBe(before?.child);
    expect(nested().shadowRoot?.querySelector('button')).toBe(before?.childButton);
    expect(parent().shadowRoot?.querySelector('button')).toBe(before?.parentButton);
    expect(nested().shadowRoot?.querySelectorAll('button')).toHaveLength(1);
    expect(nested().hasAttribute('data-gyral-seed')).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    expect(uncaught).toEqual([]);
  });

  it("runs the child's seeded init commands and Hydrated after hydration", () => {
    expect(nested().state['heard']).toEqual(['child-ready']);
    expect(nested().state['hydrated']).toBe(true);
  });

  it("wires the child's intents (and its outputs reach the parent)", async () => {
    nested().shadowRoot?.querySelector<HTMLButtonElement>('.inc')?.click();
    await settle();
    expect(nested().state['count']).toBe(1);
    expect(parent().state['bumps']).toEqual([1]);
    expect(parent().state['clicks']).toBe(0); // the child's click is not the parent's intent
  });

  it("wires the parent's intents too", async () => {
    parent().shadowRoot?.querySelector<HTMLButtonElement>('.click')?.click();
    await settle();
    expect(parent().state['clicks']).toBe(1);
  });
});

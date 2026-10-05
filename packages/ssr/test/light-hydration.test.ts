// ORDER IS LOAD-BEARING: hydrate support before anything that imports `lit` (ADR 0012).
import '../src/hydrate.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from './fixtures/light.ssr.html?raw';

const errors = vi.spyOn(console, 'error');
const uncaught: unknown[] = [];
window.addEventListener('error', (event) => {
  uncaught.push(event.error);
  event.preventDefault();
});

interface Live extends HTMLElement {
  readonly state: Record<string, unknown>;
  readonly updateComplete: Promise<boolean>;
}
const one = (sel: string, root: ParentNode = document): Live => {
  const el = root.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`missing ${sel}`);
  return el as Live;
};
const page = () => one('test-light-page');
const settle = () => new Promise((r) => setTimeout(r, 20));
const click = async (el: Element | null | undefined) => {
  (el as HTMLElement | null | undefined)?.click();
  await settle();
};

let titleParentBefore: string | undefined;

beforeAll(async () => {
  // Document CSS: light-DOM content is styled by it (shadow content would not be).
  const style = document.createElement('style');
  style.textContent = '.light-title { color: rgb(1, 2, 3); }';
  document.head.append(style);
  const host = document.createElement('div');
  host.setHTMLUnsafe(serverHtml); // parses Declarative Shadow DOM, like a page load
  document.body.append(host);
  // Before any component code loads: the heading is a plain child of the page element.
  titleParentBefore = document.querySelector('.light-title')?.parentElement?.localName;
  await import('./support/light.js');
  await page().updateComplete;
  await settle();
});

afterAll(() => {
  document.body.replaceChildren();
});

describe('light-DOM components after SSR (ADR 0014)', () => {
  it('paint from server markup as plain children that document CSS styles', () => {
    expect(titleParentBefore).toBe('test-light-page');
    expect(getComputedStyle(one('.light-title')).color).toBe('rgb(1, 2, 3)');
  });

  it('take over without errors and resume from the seed', () => {
    expect(errors).not.toHaveBeenCalled();
    expect(uncaught).toEqual([]);
    expect(page().hasAttribute('data-gyral-seed')).toBe(false);
    expect(page().state['hydrated']).toBe(true);
    expect(page().matches(':state(live)')).toBe(true);
    expect(document.querySelectorAll('.light-title')).toHaveLength(1); // replaced, not doubled
  });

  it("wire the page's own intents", async () => {
    await click(page().querySelector('.more'));
    expect(page().state['more']).toBe(1);
    expect(one('.more').textContent).toBe('more 1');
  });

  it('isolate a nested light child: its intent is its own, its output reaches the page', async () => {
    const item = one('test-light-item', page());
    await click(item.querySelector('.inc'));
    expect(item.state['count']).toBe(1);
    expect(page().state['bumps']).toEqual(['test-light-item']);
    expect(page().state['more']).toBe(1); // the page's More intent didn't fire
  });

  it('isolate a nested shadow child the same way', async () => {
    const item = one('test-shadow-item', page());
    await click(item.shadowRoot?.querySelector('.inc'));
    expect(item.state['count']).toBe(1);
    expect(page().state['bumps']).toEqual(['test-light-item', 'test-shadow-item']);
  });

  it('hydrate a light child server-rendered inside a shadow parent', async () => {
    const host = one('test-shadow-host');
    const item = one('test-light-item', host.shadowRoot ?? document);
    expect(item.hasAttribute('defer-hydration')).toBe(false);
    expect(item.querySelectorAll('button')).toHaveLength(1);
    await click(item.querySelector('.inc'));
    expect(item.state['count']).toBe(1);
    expect(host.state['bumps']).toEqual(['test-light-item']);
  });
});

// The light-DOM hydration suite (ADR 0014), shared by light-hydration.test.ts (hydrate support
// loaded first, as documented) and late-support-light-hydration.test.ts (Lit loaded first, as a
// bundler that moves shared code into an earlier chunk evaluates it; gyral-czi.41).
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/light.ssr.html?raw';

export function lightHydrationSuite(label = ''): void {
  let mounted: MountedSsr | undefined;

  const errors = vi.spyOn(console, 'error');
  const warnings = vi.spyOn(console, 'warn');
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
  // Server nodes captured before any component code loads, to check they survive hydration.
  let before: Record<string, Node | null> = {};

  /**
   * Gives a server-rendered light child a seeded count the client can't recompute from init(),
   * so a recreated child (fresh init: count 0) is distinguishable from a hydrated one.
   */
  function seedCount(item: Element | null | undefined, count: number): void {
    if (item == null) throw new Error('missing item');
    const seed = JSON.parse(item.getAttribute('data-gyral-seed') ?? '{}') as Record<
      string,
      unknown
    >;
    item.setAttribute('data-gyral-seed', JSON.stringify({ ...seed, state: { count } }));
    const button = item.querySelector('button');
    const text = [...(button?.childNodes ?? [])].find(
      (n) => n.nodeType === Node.TEXT_NODE && /\d/.test(n.textContent ?? ''),
    );
    if (text === undefined) throw new Error('no count text');
    text.textContent = String(count);
  }

  beforeAll(async () => {
    // Document CSS: light-DOM content is styled by it (shadow content would not be).
    const style = document.createElement('style');
    style.textContent = '.light-title { color: rgb(1, 2, 3); }';
    document.head.append(style);
    mounted = mountSsr(serverHtml);
    // Before any component code loads: the heading is a plain child of the page element.
    titleParentBefore = document.querySelector('.light-title')?.parentElement?.localName;
    const lightItem = document.querySelector('test-light-page test-light-item');
    const shadowHostItem = document
      .querySelector('test-shadow-host')
      ?.shadowRoot?.querySelector('test-light-item');
    seedCount(lightItem, 5);
    seedCount(shadowHostItem, 7);
    before = {
      title: document.querySelector('.light-title'),
      more: document.querySelector('test-light-page .more'),
      lightItem,
      lightItemButton: lightItem?.querySelector('button') ?? null,
      shadowItem: document.querySelector('test-light-page test-shadow-item'),
      shadowHostItem: shadowHostItem ?? null,
      shadowHostItemButton: shadowHostItem?.querySelector('button') ?? null,
    };
    await import('./light.js');
    // Waits for every nested light/shadow component; fails on mismatches or console errors.
    await hydrated(mounted);
    await settle();
  });

  afterAll(() => {
    mounted?.unmount();
  });

  describe(`light-DOM components after SSR (ADR 0014)${label}`, () => {
    it('paint from server markup as plain children that document CSS styles', () => {
      expect(titleParentBefore).toBe('test-light-page');
      expect(getComputedStyle(one('.light-title')).color).toBe('rgb(1, 2, 3)');
    });

    it('take over without errors and resume from the seed', () => {
      expect(errors).not.toHaveBeenCalled();
      expect(uncaught).toEqual([]);
      const hydrationWarnings = warnings.mock.calls.filter((args) =>
        args.some((a) => /hydrat|mismatch/i.test(String(a))),
      );
      expect(hydrationWarnings).toEqual([]);
      expect(page().hasAttribute('data-gyral-seed')).toBe(false);
      expect(page().state['hydrated']).toBe(true);
      expect(page().matches(':state(live)')).toBe(true);
      expect(document.querySelectorAll('.light-title')).toHaveLength(1); // not doubled
    });

    it('hydrate in place: every server node is kept, nothing is re-created', () => {
      expect(one('.light-title')).toBe(before['title']);
      expect(one('test-light-page .more')).toBe(before['more']);
      const lightItem = one('test-light-page test-light-item');
      expect(lightItem).toBe(before['lightItem']);
      expect(lightItem.querySelector('button')).toBe(before['lightItemButton']);
      expect(one('test-light-page test-shadow-item')).toBe(before['shadowItem']);
      const shadowHostItem = one('test-light-item', one('test-shadow-host').shadowRoot ?? document);
      expect(shadowHostItem).toBe(before['shadowHostItem']);
      expect(shadowHostItem.querySelector('button')).toBe(before['shadowHostItemButton']);
    });

    it('keep the seeds of light children nested in light and shadow parents', () => {
      expect(one('test-light-page test-light-item').state['count']).toBe(5);
      const shadowHostItem = one('test-light-item', one('test-shadow-host').shadowRoot ?? document);
      expect(shadowHostItem.state['count']).toBe(7);
    });

    it("wire the page's own intents", async () => {
      await click(page().querySelector('.more'));
      expect(page().state['more']).toBe(1);
      expect(one('.more').textContent).toBe('more 1');
    });

    it('isolate a nested light child: its intent is its own, its output reaches the page', async () => {
      const item = one('test-light-item', page());
      await click(item.querySelector('.inc'));
      expect(item.state['count']).toBe(6);
      expect(item.querySelector('.inc')?.textContent).toBe('test-light-item 6');
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
      expect(item.state['count']).toBe(8);
      expect(host.state['bumps']).toEqual(['test-light-item']);
    });
  });
}

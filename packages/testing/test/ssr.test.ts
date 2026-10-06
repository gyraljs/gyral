import { afterEach, describe, expect, it } from 'vitest';
import { define, html } from '@gyral/core';
import {
  customElementsIn,
  hydrated,
  mountSsr,
  undefinedElementsIn,
  type MountedSsr,
} from '../src/index.js';

const DOC = `<!doctype html><html><head>
<style>.from-head { color: rgb(1, 2, 3); }</style>
<meta name="csrf-token" content="tok-1">
<script type="application/json" data-gyral-stores>{"cart":{"lines":[]}}</script>
</head><body>
<test-ssr-outer><template shadowrootmode="open"><style>p { color: rgb(9, 9, 9); }</style>
<p>outer</p><test-ssr-inner><template shadowrootmode="open"><b>inner</b></template></test-ssr-inner>
</template></test-ssr-outer>
<p class="from-head">light</p>
</body></html>`;

let page: MountedSsr | undefined;
afterEach(() => {
  page?.unmount();
  page = undefined;
});

type Msg = { readonly _tag: 'Inc' };

// Server-rendered markup, until Phase 5 hydrates it, is resumed from the seed and re-rendered.
define<{ readonly n: number }, Msg>('test-ssr-counter', {
  hydrate: 'idle',
  init: () => ({ n: 0 }),
  intent: { Inc: () => ({ _tag: 'Inc' }) },
  update: { Inc: (s) => ({ n: s.n + 1 }) },
  view: (s, i) => html`<button data-intent=${i.Inc}>${s.n}</button>`,
});

const COUNTER = (attrs: string) =>
  `<test-ssr-counter ${attrs} data-gyral-seed='{"state":{"n":3},"props":{}}'>` +
  '<template shadowrootmode="open"><button data-intent="Inc">3</button></template>' +
  '</test-ssr-counter>';

const button = (page: MountedSsr) =>
  page.root.querySelector('test-ssr-counter')?.shadowRoot?.querySelector('button');

describe('mountSsr', () => {
  it('parses Declarative Shadow DOM and applies only <head> styles', () => {
    page = mountSsr(DOC);
    const outer = page.root.querySelector('test-ssr-outer');
    expect(outer?.shadowRoot?.querySelector('p')?.textContent).toBe('outer');
    expect(getComputedStyle(page.root.querySelector('.from-head') as Element).color).toBe(
      'rgb(1, 2, 3)',
    );
    // The shadow root's <style> stays inside the shadow root.
    expect(getComputedStyle(page.root.querySelector('.from-head') as Element).color).not.toBe(
      'rgb(9, 9, 9)',
    );
  });

  it('restores the store seed and named metas, and removes them on unmount', () => {
    page = mountSsr(DOC);
    expect(document.querySelector('script[data-gyral-stores]')?.textContent).toBe(
      '{"cart":{"lines":[]}}',
    );
    expect(document.querySelector('meta[name=csrf-token]')?.getAttribute('content')).toBe('tok-1');
    page.unmount();
    page = undefined;
    expect(document.querySelector('script[data-gyral-stores]')).toBeNull();
    expect(document.querySelector('meta[name=csrf-token]')).toBeNull();
  });

  it('can withhold the store seed (to prove a test depends on it)', () => {
    page = mountSsr(DOC, { stores: false });
    expect(document.querySelector('script[data-gyral-stores]')).toBeNull();
  });

  it('accepts a body fragment', () => {
    page = mountSsr('<p id="frag">x</p>');
    expect(page.root.querySelector('#frag')?.textContent).toBe('x');
  });
});

describe('hydrated: elements that never upgrade (gyral-czi.32)', () => {
  it('fails naming server-rendered elements whose module was never imported', async () => {
    page = mountSsr(
      '<test-never-defined><template shadowrootmode="open"><p>x</p></template></test-never-defined>',
    );
    await expect(hydrated(page)).rejects.toThrow(/<test-never-defined>.*allowUndefined/);
  });

  it('accepts listed tags and always allows <gyral-stores>', async () => {
    page = mountSsr('<gyral-stores><test-never-defined-2></test-never-defined-2></gyral-stores>');
    expect(undefinedElementsIn(page.root)).toEqual(['test-never-defined-2']);
    await expect(
      hydrated(page, { allowUndefined: ['test-never-defined-2'] }),
    ).resolves.toBeUndefined();
  });
});

describe('hydrated', () => {
  it('finds elements inside nested shadow roots', () => {
    page = mountSsr(DOC);
    const tags = customElementsIn(page.root).map((el) => el.localName);
    expect(tags).toEqual(['test-ssr-outer', 'test-ssr-inner']);
  });

  it('waits for Gyral components to render (settled)', async () => {
    page = mountSsr(COUNTER(''));
    await hydrated(page);
    const el = page.root.querySelector('test-ssr-counter') as HTMLElement & {
      readonly state: { readonly n: number };
    };
    expect(el.state.n).toBe(3);
    button(page)?.click();
    await hydrated(page);
    expect(button(page)?.textContent).toBe('4');
  });

  it('leaves islands deferred unless asked to release them', async () => {
    page = mountSsr(COUNTER('defer-hydration data-gyral-hydrate="visible"'));
    await hydrated(page);
    const el = page.root.querySelector('test-ssr-counter');
    expect(el?.hasAttribute('defer-hydration')).toBe(true);
    await hydrated(page, { releaseIslands: true });
    expect(el?.hasAttribute('defer-hydration')).toBe(false);
    expect(el?.hasAttribute('data-gyral-hydrate')).toBe(false);
    expect(el?.hasAttribute('data-gyral-seed')).toBe(false); // resumed and rendered
  });

  it('fails when console errors were recorded', async () => {
    page = mountSsr('<p>x</p>');
    await expect(hydrated(page)).resolves.toBeUndefined();
    console.error('Hydration value mismatch: Unexpected TemplateResult');
    await expect(hydrated(page)).rejects.toThrow(/Hydration value mismatch/);
  });
});

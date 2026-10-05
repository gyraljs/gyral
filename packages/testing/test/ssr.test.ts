import { afterEach, describe, expect, it } from 'vitest';
import { customElementsIn, hydrated, mountSsr, type MountedSsr } from '../src/index.js';

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

/** A non-Lit custom element whose updates finish when the test says so. */
function slowElement(tag: string): { done: () => void } {
  let resolve: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  customElements.define(
    tag,
    class extends HTMLElement {
      readonly updateComplete = done.then(() => {
        this.setAttribute('data-done', '');
        return true;
      });
    },
  );
  return { done: resolve };
}

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

describe('hydrated', () => {
  it('finds elements inside nested shadow roots', () => {
    page = mountSsr(DOC);
    const tags = customElementsIn(page.root).map((el) => el.localName);
    expect(tags).toEqual(['test-ssr-outer', 'test-ssr-inner']);
  });

  it('waits for every element, including one nested in a shadow root', async () => {
    page = mountSsr(DOC);
    const outer = slowElement('test-ssr-outer');
    const inner = slowElement('test-ssr-inner');
    let finished = false;
    const waiting = hydrated(page).then(() => {
      finished = true;
    });
    outer.done();
    await new Promise((r) => setTimeout(r, 10));
    expect(finished).toBe(false); // the nested element is still updating
    inner.done();
    await waiting;
    const nested = page.root
      .querySelector('test-ssr-outer')
      ?.shadowRoot?.querySelector('test-ssr-inner');
    expect(nested?.hasAttribute('data-done')).toBe(true);
  });

  it('fails when console errors were recorded, ignoring the Lit dev-mode banner', async () => {
    page = mountSsr('<p>x</p>');
    console.warn('Lit is in dev mode. Not recommended for production!');
    await expect(hydrated(page)).resolves.toBeUndefined();
    console.error('Hydration value mismatch: Unexpected TemplateResult');
    await expect(hydrated(page)).rejects.toThrow(/Hydration value mismatch/);
  });
});

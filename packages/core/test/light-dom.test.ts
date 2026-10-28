import { afterEach, describe, expect, it, vi } from 'vitest';
import { css, define, html, settled } from '../src/index.js';
import { isLightComponent } from '../src/light-dom.js';

type Msg = { readonly _tag: 'Hit' };
interface State {
  readonly hits: number;
}

const counter = (tag: string, shadow: boolean, inner = '') =>
  define<State, Msg>()(tag, {
    shadow,
    init: () => ({ hits: 0 }),
    intent: { Hit: true },
    update: { Hit: (s) => ({ hits: s.hits + 1 }) },
    view: (s) =>
      html`<button class="hit" data-intent="Hit">${s.hits}</button>${
          inner === '' ? '' : html`<test-ld-inner></test-ld-inner>`
        }`,
  });

const Inner = counter('test-ld-inner', false);
const LightOuter = counter('test-ld-light-outer', false, 'inner');
const ShadowOuter = counter('test-ld-shadow-outer', true, 'inner');

type Live = HTMLElement & { readonly state: State };

async function mount(tag: string): Promise<Live> {
  const el = document.createElement(tag) as Live;
  document.body.append(el);
  await settled();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('shadow: false (ADR 0014)', () => {
  it('renders into the element itself, styled by document CSS', async () => {
    const style = document.createElement('style');
    style.textContent = 'test-ld-light-outer .hit { color: rgb(9, 8, 7); }';
    document.head.append(style);
    const el = await mount('test-ld-light-outer');
    expect(el.shadowRoot).toBeNull();
    const button = el.querySelector(':scope > .hit');
    expect(button).not.toBeNull();
    expect(getComputedStyle(button as Element).color).toBe('rgb(9, 8, 7)');
    style.remove();
  });

  it('keeps intents of a nested light child out of a light parent', async () => {
    const outer = await mount('test-ld-light-outer');
    const inner = outer.querySelector('test-ld-inner') as Live;
    await settled();
    (inner.querySelector('.hit') as HTMLElement).click();
    expect(inner.state.hits).toBe(1);
    expect(outer.state.hits).toBe(0);
    (outer.querySelector(':scope > .hit') as HTMLElement).click();
    expect(outer.state.hits).toBe(1);
    expect(inner.state.hits).toBe(1);
  });

  it('keeps intents of a nested light child out of a shadow parent', async () => {
    const outer = await mount('test-ld-shadow-outer');
    const inner = outer.shadowRoot?.querySelector('test-ld-inner') as Live;
    await settled();
    (inner.querySelector('.hit') as HTMLElement).click();
    expect(inner.state.hits).toBe(1);
    expect(outer.state.hits).toBe(0);
  });

  it('ignores styles with a warning, and is detectable by @gyral/ssr', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Styled = define<State, Msg>()('test-ld-styled', {
      shadow: false,
      styles: css`
        p {
          color: red;
        }
      `,
      init: () => ({ hits: 0 }),
      update: { Hit: (s) => s },
      view: () => html`<p>x</p>`,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('styles are ignored'));
    warn.mockRestore();
    expect(isLightComponent(Styled)).toBe(true);
    expect(isLightComponent(Inner)).toBe(true);
    expect(isLightComponent(ShadowOuter)).toBe(false);
    expect(isLightComponent(LightOuter)).toBe(true);
  });
});

// Children the page's HTML put in a light host are fallback content for a page without
// JavaScript: the component owns its children (ADR 0014), so its first fresh render replaces
// them, as a shadow root's does (gyral-k97.4, 0.3.7). Hydration still adopts the server's.
describe("a light host's first render", () => {
  it("replaces the page's fallback children, defined after the markup as a page does", async () => {
    document.body.innerHTML =
      '<test-ld-fallback><p class="fallback">This page needs JavaScript.</p></test-ld-fallback>';
    counter('test-ld-fallback', false);
    await settled();
    const el = document.querySelector('test-ld-fallback') as Live;
    expect(el.querySelector('.fallback')).toBeNull();
    expect([...el.children].map((child) => child.className)).toEqual(['hit']);
  });

  it('replaces them when the element is created with children, then attached', async () => {
    const el = document.createElement('test-ld-light-outer') as Live;
    el.innerHTML = '<p class="fallback">fallback</p>';
    document.body.append(el);
    await settled();
    expect(el.querySelector('.fallback')).toBeNull();
    expect(el.querySelector(':scope > .hit')?.textContent).toBe('0');
  });

  it('keeps its view, and its state, when moved after its first render', async () => {
    const el = await mount('test-ld-light-outer');
    (el.querySelector(':scope > .hit') as HTMLElement).click();
    await settled();
    const button = el.querySelector(':scope > .hit');
    const elsewhere = document.createElement('section');
    document.body.append(elsewhere);
    elsewhere.append(el);
    await settled();
    expect(el.querySelector(':scope > .hit')).toBe(button);
    expect(el.querySelectorAll(':scope > .hit')).toHaveLength(1);
    expect(button?.textContent).toBe('1');
  });
});

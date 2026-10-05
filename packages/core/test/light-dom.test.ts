import { afterEach, describe, expect, it, vi } from 'vitest';
import { css, define, html, isLightComponent } from '../src/index.js';

type Msg = { readonly _tag: 'Hit' };
interface State {
  readonly hits: number;
}

const counter = (tag: string, shadow: boolean, inner = '') =>
  define<State, Msg>(tag, {
    shadow,
    init: () => ({ hits: 0 }),
    intent: { Hit: () => ({ _tag: 'Hit' }) },
    update: { Hit: (s) => ({ hits: s.hits + 1 }) },
    view: (s) =>
      html`<button class="hit" data-intent="Hit">${s.hits}</button>${
          inner === '' ? '' : html`<test-ld-inner></test-ld-inner>`
        }`,
  });

const Inner = counter('test-ld-inner', false);
const LightOuter = counter('test-ld-light-outer', false, 'inner');
const ShadowOuter = counter('test-ld-shadow-outer', true, 'inner');

type Live = HTMLElement & { readonly state: State; readonly updateComplete: Promise<boolean> };

async function mount(tag: string): Promise<Live> {
  const el = document.createElement(tag) as Live;
  document.body.append(el);
  await el.updateComplete;
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
    await inner.updateComplete;
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
    await inner.updateComplete;
    (inner.querySelector('.hit') as HTMLElement).click();
    expect(inner.state.hits).toBe(1);
    expect(outer.state.hits).toBe(0);
  });

  it('ignores styles with a warning, and is detectable by @gyral/ssr', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Styled = define<State, Msg>('test-ld-styled', {
      shadow: false,
      styles: css`
        p {
          color: red;
        }
      `,
      init: () => ({ hits: 0 }),
      intent: {},
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

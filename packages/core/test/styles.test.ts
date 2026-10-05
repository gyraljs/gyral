import { afterEach, describe, expect, it } from 'vitest';
import { css, define, html, type Stateless } from '../src/index.js';

const sheet = new CSSStyleSheet();
sheet.replaceSync('b { font-weight: 900; }');

const tokens = 'p { color: rgb(1, 2, 3); }';

const Styled = define<Stateless, never>('test-styled', {
  intent: {},
  update: {},
  view: () =>
    html`<p>p</p>
      <b>b</b>
      <i>i</i>`,
  // A plain string (shared with the document), a constructed sheet and a css`` template, nested.
  styles: [
    tokens,
    [
      sheet,
      css`
        i {
          margin-inline-start: 7px;
        }
      `,
    ],
  ],
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('define() styles (gyral-czi.24)', () => {
  it('accepts plain CSS strings, CSSStyleSheets and css`` templates in nested arrays', async () => {
    const el = new Styled();
    document.body.append(el);
    await el.updateComplete;
    const style = (sel: string) => {
      const node = el.shadowRoot?.querySelector(sel);
      if (node == null) throw new Error(`missing ${sel}`);
      return getComputedStyle(node);
    };
    expect(style('p').color).toBe('rgb(1, 2, 3)');
    expect(style('b').fontWeight).toBe('900');
    expect(style('i').marginInlineStart).toBe('7px');
  });

  it('keeps one shared CSSStyleSheet instance across components', async () => {
    const el = new Styled();
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot?.adoptedStyleSheets).toContain(sheet);
  });
});

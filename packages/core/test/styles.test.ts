// Component styles (docs/design-docs/view/08-styles.md "Authoring", "Browser").
import { afterEach, describe, expect, it } from 'vitest';
import { css, define, html, settled, type Stateless } from '../src/index.js';

const tokens = 'p { color: rgb(1, 2, 3); }';
const WEIGHT = 900;
const shared = css`
  b {
    font-weight: ${WEIGHT};
  }
`;

const view = () =>
  html`<p>p</p>
    <b>b</b>
    <i>i</i>`;

const Styled = define<Stateless, never>()('test-styled', {
  intent: {},
  update: {},
  view,
  // A plain string (shared with the document), a shared css value and a nested one.
  styles: [
    tokens,
    [
      shared,
      css`
        i {
          margin-inline-start: ${7}px;
        }
      `,
    ],
  ],
});

const Other = define<Stateless, never>()('test-styled-other', {
  intent: {},
  update: {},
  view,
  styles: shared,
});

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(tag: string): Promise<HTMLElement> {
  const el = document.createElement(tag);
  document.body.append(el);
  await settled();
  return el;
}

describe('define() styles', () => {
  it('accepts plain strings and css values with interpolations, in nested arrays', async () => {
    const el = await mount('test-styled');
    const style = (sel: string) => {
      const node = el.shadowRoot?.querySelector(sel);
      if (node == null) throw new Error(`missing ${sel}`);
      return getComputedStyle(node);
    };
    expect(style('p').color).toBe('rgb(1, 2, 3)');
    expect(style('b').fontWeight).toBe('900');
    expect(style('i').marginInlineStart).toBe('7px');
    expect(el.shadowRoot?.querySelector('style')).toBeNull(); // adopted, no <style> fallback
  });

  it('maps one css value to one CSSStyleSheet shared by every component and instance', async () => {
    const a = await mount('test-styled');
    const b = await mount('test-styled');
    const c = await mount('test-styled-other');
    const sheetsOf = (el: HTMLElement) => el.shadowRoot?.adoptedStyleSheets ?? [];
    expect(sheetsOf(a)).toHaveLength(3);
    expect(sheetsOf(a)).toEqual(sheetsOf(b));
    expect(sheetsOf(a)[0]).toBe(sheetsOf(b)[0]);
    expect(sheetsOf(c)[0]).toBe(sheetsOf(a)[1]);
    expect(Styled.spec.styles).toBeDefined();
    expect(Other.spec.styles).toBe(shared);
  });

  it('inserts strings, numbers and other css values as written', () => {
    const inner = css`
      --x: 1;
    `;
    expect(
      css`
        a {
          ${inner} gap: ${4}px;
          content: ${'"y"'};
        }
      `.text
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe('a { --x: 1; gap: 4px; content: "y"; }');
  });
});

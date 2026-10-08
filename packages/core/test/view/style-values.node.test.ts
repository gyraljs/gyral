// ADR 0020: the server renderer's `styleAttributes` collector records every `style` attribute
// value it writes, decoded as the DOM sees it, for hashing into a CSP: static, bound,
// multi-part and element-hook values, in light and shadow components, nested templates and
// each() rows; empty values and raw() markup are skipped, and the markup doesn't change.
import { describe, expect, it } from 'vitest';
import { define, defineHook, each, html, raw } from '../../src/index.js';
import { renderToString, type StyleValues } from '../../src/server.js';

const tint = defineHook<[color: string]>({
  server: ([color]) => ({ style: `color: ${color}` }),
  client: () => undefined,
});

define<{ readonly w: number }, never>('sv-shadow', {
  init: () => ({ w: 40 }),
  intent: {},
  update: {},
  view: (s) => html`<p style=${`--w: ${String(s.w)}%`}>shadow</p>`,
});

define<{ readonly w: number }, never>('sv-light', {
  shadow: false,
  init: () => ({ w: 60 }),
  intent: {},
  update: {},
  view: (s) =>
    html`<p style="inline-size: ${s.w}px">light</p>
      <sv-shadow></sv-shadow>`,
});

const collect = (value: Parameters<typeof renderToString>[0]) => {
  const values: StyleValues = new Map();
  const out = renderToString(value, { dev: false, styleAttributes: values });
  return { values: [...values.keys()], out };
};

describe('styleAttributes (ADR 0020)', () => {
  it('records static, bound, multi-part and hook values, decoded and deduplicated', () => {
    const rows = [1, 2, 2];
    const { values } = collect(
      html`<div style="color: red">
        <b style=${'--x: "a&b"'}></b>
        <i style="margin: ${1}px ${2}px"></i>
        <em ${tint('rgb(1, 2, 3)')}></em>
        <span style='content: "&lt;&amp;"'></span>
        ${each(
          rows,
          (n) => n,
          (n) => html`<li style=${`order: ${String(n)}`}></li>`,
        )}
        <u style="color: red"></u>
      </div>`,
    );
    expect(values).toEqual([
      'color: red',
      'content: "<&"',
      '--x: "a&b"',
      'margin: 1px 2px',
      'color: rgb(1, 2, 3)',
      'order: 1',
      'order: 2',
    ]);
  });

  it('skips empty values and raw() markup', () => {
    const { values } = collect(
      html`<p style=""></p>
        <p style=${''}></p>
        ${raw('<p style="color: blue"></p>')}`,
    );
    expect(values).toEqual([]);
  });

  it('covers light and shadow components', () => {
    const { values } = collect(html`<sv-light></sv-light>`);
    expect(values).toEqual(['inline-size: 60px', '--w: 40%']);
  });

  it("doesn't change the markup", () => {
    const page = html`<div style="color: red"><sv-light></sv-light></div>`;
    expect(collect(page).out).toBe(renderToString(page, { dev: false }));
  });

  it('maps each value to the template that first wrote it (its loc in development)', () => {
    const values: StyleValues = new Map();
    renderToString(html`<p style="color: red"></p>`, { dev: true, styleAttributes: values });
    expect(values.get('color: red')).toMatch(/style-values\.node\.test\.ts:\d+/);
  });
});

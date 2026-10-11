// view/06-server.md for svg fragments (view/01 "svg templates"): the server writes an svg
// template's HTML as is inside the parent's <svg> (self-closing tags, attribute names as
// written, values escaped as everywhere), and in development an svg template written outside
// SVG content is an error, since the parser would not create SVG elements there.
import { describe, expect, it } from 'vitest';
import { renderToString } from '../../src/server.js';
import { each, html, nothing, svg } from '../../src/view/index.js';

const prod = (value: Parameters<typeof renderToString>[0]) => renderToString(value, { dev: false });

describe('server rendering of svg templates (view/06)', () => {
  it('writes the fragment inside the parent <svg>, values escaped', () => {
    const value = html`<svg viewBox="0 0 2 2">
      ${svg`<path d=${'M0 0 "<&>"'} transform="rotate(${45})" /><text x="1">${'a < b & c'}</text>`}
    </svg>`;
    expect(prod(value)).toBe(
      '<svg viewBox="0 0 2 2"><path d="M0 0 &quot;&lt;&amp;&gt;&quot;" transform="rotate(45)"/>' +
        '<text x="1">a &lt; b &amp; c</text></svg>',
    );
  });

  it('writes bound SVG attributes with their SVG spelling, nested, conditional and listed fragments', () => {
    const value = html`<svg>
      ${svg`<g viewbox=${'0 0 1 1'}>${svg`<circle r=${1} />`}${nothing}${each(
        [1, 2],
        (k) => k,
        (k) => svg`<rect x=${k} />`,
      )}</g>`}
    </svg>`;
    expect(prod(value)).toBe(
      '<svg><g viewBox="0 0 1 1"><circle r="1"/><!----><!----><rect x="1"/><rect x="2"/></g></svg>',
    );
  });

  it('writes development markers before svg instances', () => {
    const out = renderToString(html`<svg>${svg`<g></g>`}</svg>`, { dev: true });
    expect(out).toMatch(/^<!--gyral:[0-9a-z]+--><svg><!--gyral:[0-9a-z]+--><g><\/g><\/svg>$/);
  });

  it('allows svg templates in any SVG element, and html templates in <foreignObject>', () => {
    const value = html`<svg>
      ${svg`<g><foreignObject>${html`<p>${'x'}</p>`}</foreignObject>${svg`<g></g>`}</g>`}
    </svg>`;
    expect(() => renderToString(value, { dev: true })).not.toThrow();
  });

  it('is a development error outside SVG content; production writes it as is', () => {
    for (const [value, where] of [
      [svg`<path />`, 'at the root of a view'],
      [html`<div>${svg`<path />`}</div>`, 'inside <div>'],
      [
        html`<svg>${svg`<foreignObject>${svg`<g></g>`}</foreignObject>`}</svg>`,
        'inside <foreignobject>',
      ],
      [html`<svg><desc>${svg`<g></g>`}</desc></svg>`, 'inside <desc>'],
    ] as const) {
      expect(() => renderToString(value, { dev: true })).toThrow(
        `an svg template is written ${where}`,
      );
    }
    expect(prod(html`<div>${svg`<path />`}</div>`)).toBe('<div><path/></div>');
  });
});

// view/01-templates.md "svg templates" and view/09-template-rules.md rule 10, in the normalizer:
// an svg template's top level is SVG content (as inside the <svg> it renders in), so elements
// are SVG elements, self-closing is allowed, bound attribute names take SVG's spelling, and HTML
// at its top level is an error that points to html`…`; html templates still reject SVG-only
// elements at their top level, now pointing to svg`…`.
import { describe, expect, it } from 'vitest';
import { checkTemplate } from '../../src/view/normalize/check.js';
import { TemplateError } from '../../src/view/normalize/errors.js';
import { templateId } from '../../src/view/normalize/id.js';
import { analyze, normalize } from '../../src/view/normalize/normalize.js';
import { emptyRender, readable, t } from './helpers.js';

const svg = (strings: readonly string[]) => normalize(strings, undefined, true);

function errorOf(strings: readonly string[], isSvg = true): TemplateError {
  try {
    normalize(strings, undefined, isSvg);
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error(`expected a TemplateError for ${JSON.stringify(strings)}`);
}

describe('svg templates: the normalizer (view/01 "svg templates")', () => {
  it('flags the template object and keeps the markup as SVG content', () => {
    const n = svg(t`<path d=${'M0 0'} transform="rotate(4)"/><g>${'x'}</g>`);
    expect(n.svg).toBe(true);
    expect(n.html).toBe('<path transform="rotate(4)"/><g></g>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'attr', path: [0], name: 'd' },
      { k: 'child', path: [1], ref: null, sole: true },
    ]);
    expect(normalize(t`<p>${1}</p>`).svg).toBeUndefined();
  });

  it('shapes SVG elements by their lower-case names, as the browser check reads them', () => {
    const { shape } = analyze(
      t`<clipPath id="c"><rect/></clipPath><linearGradient/>`,
      undefined,
      true,
    );
    expect(shape).toEqual([
      ['clippath', [['rect', []]]],
      ['lineargradient', []],
    ]);
  });

  it('self-closing SVG elements at the top level have no end tag and no children', () => {
    const n = svg(t`<circle r=${1}/><text x="1">${'a'}</text>`);
    expect(n.html).toBe('<circle/><text x="1"></text>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'attr', path: [0], name: 'r' },
      { k: 'child', path: [1], ref: null, sole: true },
    ]);
  });

  it('spells bound attributes as the parser does: SVG camelCase, others lower case', () => {
    const names = (strings: readonly string[], isSvg = true): unknown[] =>
      normalize(strings, undefined, isSvg).parts.map((p) => readable(p));
    expect(names(t`<svg viewbox=${1} VIEWBOX2=${2}></svg>`)).toEqual([
      { k: 'attr', path: [0], name: 'viewBox' },
      { k: 'attr', path: [0], name: 'viewbox2' },
    ]);
    expect(names(t`<g gradientTransform=${1} ?pathlength=${2} .fooBar=${3}></g>`)).toEqual([
      { k: 'attr', path: [0], name: 'gradientTransform' },
      { k: 'bool', path: [0], name: 'pathLength' },
      { k: 'prop', path: [0], name: 'fooBar' },
    ]);
    // Inline <svg> in html templates follows the same table.
    expect(names(t`<svg viewbox=${1}><path STROKE-Width=${2}/></svg>`, false)).toEqual([
      { k: 'attr', path: [0], name: 'viewBox' },
      { k: 'attr', path: [0, 0], name: 'stroke-width' },
    ]);
  });

  it('marks child holes whose parent is SVG content for the server', () => {
    const n = svg(t`${0}<g>${1}</g><foreignObject>${2}</foreignObject><text>${3}</text>`);
    const ops = (n.segments ?? []).filter((s) => typeof s !== 'string');
    expect(ops).toEqual([
      { k: 'child' },
      { k: 'child', in: 'g', svg: true },
      { k: 'child', in: 'foreignobject' },
      { k: 'child', in: 'text', svg: true },
    ]);
    const inline = normalize(t`<svg>${1}</svg><p>${2}</p>`).segments ?? [];
    expect(inline.filter((s) => typeof s !== 'string')).toEqual([
      { k: 'child', in: 'svg', svg: true },
      { k: 'child', in: 'p' },
    ]);
    expect(emptyRender(n.segments ?? [])).toBe(n.html);
  });

  it('allows text, comments, holes and anchors at the top level', () => {
    const n = svg(t`${'a'} <!-- c --><tspan>${'b'}</tspan> and ${'c'} text`);
    expect(n.html).toBe('<!----> <!-- c --><tspan></tspan> and <!----> text');
  });

  it('HTML inside <foreignObject> follows the HTML rules', () => {
    const n = svg(
      t`<foreignObject width="10"><div class=${'c'}><input value=${1}></div></foreignObject>`,
    );
    expect(n.html).toBe('<foreignObject width="10"><div><input></div></foreignObject>');
    expect(errorOf(t`<foreignObject><div/></foreignObject>`).rule).toBe(6);
    expect(errorOf(t`<foreignObject><g></g></foreignObject>`).rule).toBe(10);
  });

  it('gives an svg template a different id than an html template with the same strings', () => {
    const strings = t`<a href=${'#'}>${'x'}</a>`;
    expect(svg(strings).id).not.toBe(normalize(strings).id);
    expect(svg(strings).id).toBe(templateId(strings, true));
    expect(normalize(strings).id).toBe(templateId(strings));
  });
});

describe('rule 10: SVG and HTML content (view/09)', () => {
  it('html templates reject SVG-only top-level elements and point to svg`…`', () => {
    const error = errorOf(t`<g>${0}</g>`, false);
    expect(error.rule).toBe(10);
    expect(error.message).toContain('<g> is an SVG element outside an <svg>');
    expect(error.message).toContain('svg`<g …></g>`');
    expect(error.message).toContain("import { svg } from '@gyral/core'");
    expect(error.message).toContain('Or wrap it');
  });

  it('svg templates reject HTML at their top level and point to html`…`', () => {
    for (const markup of [t`<div></div>`, t`<p>${1}</p>`, t`<button></button>`, t`<span/>`]) {
      const error = errorOf(markup);
      expect(error.rule, error.message).toBe(10);
      expect(error.message).toContain('this is an svg template');
      expect(error.message).toContain('html`…`');
      expect(error.message).toContain('<foreignObject>');
    }
    expect(errorOf(t`<!doctype html>`).rule).toBe(10);
  });

  it('HTML-only elements nested in SVG content are errors in both kinds of template', () => {
    expect(errorOf(t`<g><input></g>`).message).toContain('HTML element inside SVG content');
    expect(errorOf(t`<svg><section></section></svg>`, false).rule).toBe(10);
    // Elements that end the SVG element stay rule 7.
    expect(errorOf(t`<g><div></div></g>`).rule).toBe(7);
  });

  it('bound namespaced attributes are errors (bind href, SVG 2); static ones are fine', () => {
    const error = errorOf(t`<use xlink:href=${'#a'}/>`);
    expect(error.rule).toBe(10);
    expect(error.message).toContain('href=${…} for xlink:href');
    expect(errorOf(t`<svg><text xml:lang=${'en'}></text></svg>`, false).rule).toBe(10);
    expect(() => svg(t`<use xlink:href="#a" href=${'#b'}/>`)).not.toThrow();
  });

  it('checkTemplate (ESLint) reports the same errors for svg templates', () => {
    expect(checkTemplate(t`<path d=${1}/>`, true)).toBeUndefined();
    expect(checkTemplate(t`<path d=${1}/>`)?.error.rule).toBe(10);
    expect(checkTemplate(t`<div></div>`, true)?.error.rule).toBe(10);
  });
});

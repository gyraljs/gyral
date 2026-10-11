// view/01-templates.md "The template object" and view/06-server.md "Writing a template
// result": the server segments reproduce the client HTML, and every value has exactly one
// place. Properties over generated templates (view/README.md "Conformance").
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/view/normalize/normalize.js';
import { minifyStrings } from '../../src/view/normalize/whitespace.js';
import { STATIC_STYLE, template } from './arbitrary.js';
import { emptyRender, t, valueCounts } from './helpers.js';

describe('segments (view/06)', () => {
  it('split the HTML at holes, with attribute ops in the start tag', () => {
    const n = normalize(t`<a class="x" href=${'u'} ?hidden=${0}>Hi ${'n'}!</a>`);
    expect(n.segments).toEqual([
      '<a class="x"',
      { k: 'attr', name: 'href' },
      { k: 'bool', name: 'hidden' },
      '>Hi ',
      { k: 'child', in: 'a' },
      '<!---->!</a>',
    ]);
  });

  it('mark custom elements, with their static attributes decoded for props', () => {
    const n = normalize(
      t`<p><shop-cart sku="a1" label='A &amp; B' open .lines=${[]}>${0}</shop-cart></p>`,
    );
    expect(n.segments).toEqual([
      '<p>',
      {
        k: 'open',
        tag: 'shop-cart',
        html: `<shop-cart sku="a1" label='A &amp; B' open`,
        attrs: [
          ['sku', 'a1'],
          ['label', 'A & B'],
          ['open', ''],
        ],
      },
      { k: 'prop', name: 'lines' },
      { k: 'openEnd' },
      { k: 'child', in: 'shop-cart' },
      { k: 'close', tag: 'shop-cart' },
      '</p>',
    ]);
  });

  it('carry multi-attribute pieces, hooks and text content', () => {
    const n = normalize(t`<input class="a ${0} b" ${1}><title>${2}</title>`);
    expect(n.segments).toEqual([
      '<input',
      { k: 'attr', name: 'class', strings: ['a ', ' b'] },
      { k: 'hook' },
      '><title>',
      { k: 'text' },
      '</title>',
    ]);
  });

  it('are JSON data: a round trip changes nothing', () => {
    const n = normalize(t`<my-el a="1" .p=${0}><p class="x ${1}">${2} y</p></my-el>`, 'a.ts:1:1');
    expect(JSON.parse(JSON.stringify(n))).toEqual(n);
  });
});

describe('normalizer properties (view/README "Conformance")', () => {
  it('segments written empty reproduce the HTML; parts and segments take every value once', () => {
    fc.assert(
      fc.property(template, (strings) => {
        const n = normalize(strings);
        // The client HTML leaves static styles to the part table (01 "Normalization").
        expect(emptyRender(n.segments ?? []).replaceAll(STATIC_STYLE, '')).toBe(n.html);
        expect(valueCounts(n)).toEqual({ parts: strings.length - 1, segments: strings.length - 1 });
      }),
      { numRuns: 300 },
    );
  });

  it('is idempotent on whitespace: normalizing minified strings changes nothing', () => {
    fc.assert(
      fc.property(template, (strings) => {
        const once = minifyStrings(strings);
        expect(minifyStrings(once)).toEqual(once);
        expect(once).toHaveLength(strings.length);
        expect(normalize(once)).toEqual(normalize(strings));
      }),
      { numRuns: 300 },
    );
  });
});

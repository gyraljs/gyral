// fast-check generator of valid templates (as static strings), with holes in every kind of
// position and arbitrary indentation, for the normalizer's properties (node) and the browser
// check that its paths match the real parser (prepare.test.ts).
import fc from 'fast-check';

const H = '\u0000';

const ws = fc.constantFrom('', ' ', '\n', '\n  ', '  ', '\n    \n  ', '\t');
const text = fc.constantFrom('a', 'Hello', 'x  y', 'a &amp; b', '1 < 2', 'é');

/** Attributes with distinct names (a template may not repeat one). */
const attrs = fc
  .subarray([
    ' class="c"',
    ' id=x',
    ' hidden',
    ` title=${H}`,
    ` data-v="${H}"`,
    ` ?inert=${H}`,
    ` .foo=${H}`,
    ` data-m="a ${H} b"`,
    ` data-n="${H}${H}"`,
    ` ${H}`,
    ` aria-label='q ${H}'`,
  ])
  .chain((list) => fc.shuffledSubarray(list, { minLength: list.length }))
  .map((list) => list.join(''));

const leaf = fc.oneof(
  text,
  fc.constant(H),
  fc.constant('<!-- c -->'),
  attrs.map((a) => `<input${a}>`),
  fc.constant('<br>'),
  attrs.map((a) => `<textarea${a}>${H}</textarea>`),
  fc.constant(`<svg viewBox="0 0 1 1"><path d=${H} /><g>${H}</g></svg>`),
);

const { phrasing, flow } = fc.letrec<{ phrasing: string; flow: string }>((tie) => {
  const children = (kind: 'phrasing' | 'flow'): fc.Arbitrary<string> =>
    fc
      .array(fc.tuple(ws, tie(kind)), { maxLength: 4 })
      .chain((items) => ws.map((end) => items.map(([w, c]) => w + c).join('') + end));
  const element = (tags: readonly string[], kind: 'phrasing' | 'flow'): fc.Arbitrary<string> =>
    fc
      .tuple(fc.constantFrom(...tags), attrs, children(kind))
      .map(([tag, a, inner]) => `<${tag}${a}>${inner}</${tag}>`);
  return {
    phrasing: fc.oneof(
      { depthSize: 'small' },
      leaf,
      element(['span', 'b', 'em', 'my-el'], 'phrasing'),
    ),
    flow: fc.oneof(
      { depthSize: 'small' },
      leaf,
      fc.constant('<pre>\n  keep  this\n</pre>'),
      element(['span', 'b', 'my-el'], 'phrasing'),
      element(['div', 'section'], 'flow'),
      element(['p', 'button'], 'phrasing'),
      fc.constant(`<ul><li>${H}</li><li>a ${H} b</li></ul>`),
      fc.constant(`<table><tbody><tr><td>${H}</td><td class=${H}>x</td></tr></tbody></table>`),
    ),
  };
});

/** A valid template's static strings (holes between them). */
export const template: fc.Arbitrary<readonly string[]> = fc
  .array(fc.tuple(ws, fc.oneof(flow, phrasing)), { minLength: 1, maxLength: 4 })
  .chain((items) => ws.map((end) => items.map(([w, c]) => w + c).join('') + end))
  .map((source) => source.split(H));

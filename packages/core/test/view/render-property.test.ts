// Properties of the client renderer (view/02-bindings.md, view/03-lists.md) with fast-check in
// Chromium: rendering any sequence of template results into one root ends with the same DOM as
// rendering the last one into a fresh root; keyed rows keep their nodes across reorders.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { each, html, nothing, render, type ChildValue } from '../../src/view/index.js';
import { refills } from './render-arbitrary.js';
import { fresh, mount } from './render-helpers.js';

type Attr = string | number | boolean | null | undefined | typeof nothing;

const T = {
  para: (a: Attr, v: ChildValue) => html`<p class=${a}>${v}</p>`,
  pair: (a: ChildValue, b: ChildValue) => html`${a} and ${b}`,
  multi: (a: Attr, b: Attr, v: ChildValue) => html`<span title="t ${a} ${b}">${v}<i></i></span>`,
  bare: (v: ChildValue) => html`${v}`,
  flag: (on: boolean, v: ChildValue) => html`<div ?hidden=${on}>x${v}y</div>`,
  edges: (a: ChildValue, b: ChildValue) =>
    html`${a}
      <hr />
      ${b}`,
};

interface Item {
  readonly k: number;
  readonly v: ChildValue;
}

const ROWS = {
  one: (it: Item) => html`<li data-k=${it.k}>${it.v}</li>`,
  two: (it: Item) =>
    html`<dt data-k=${it.k}>${it.k}</dt>
      <dd>${it.v}</dd>`,
  bare: (it: Item) => html`${it.v}`,
};

const attr: fc.Arbitrary<Attr> = fc.oneof(
  fc.constantFrom<Attr>(null, undefined, nothing, '', 'x', 'y z', true, false),
  fc.integer({ min: -2, max: 20 }),
);

const leaf: fc.Arbitrary<ChildValue> = fc.oneof(
  fc.constantFrom<ChildValue>('', 'a', 'bc', null, undefined, false, nothing),
  fc.integer({ min: 0, max: 99 }),
);

const { value } = fc.letrec<{ value: ChildValue; tpl: ChildValue; list: ChildValue }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leaf,
    tie('tpl'),
    tie('list'),
    fc.array(tie('value'), { maxLength: 3 }),
  ),
  tpl: fc.oneof(
    fc.tuple(attr, tie('value')).map(([a, v]) => T.para(a, v)),
    fc.tuple(tie('value'), tie('value')).map(([a, b]) => T.pair(a, b)),
    fc.tuple(attr, attr, tie('value')).map(([a, b, v]) => T.multi(a, b, v)),
    tie('value').map((v) => T.bare(v)),
    fc.tuple(fc.boolean(), tie('value')).map(([on, v]) => T.flag(on, v)),
    fc.tuple(tie('value'), tie('value')).map(([a, b]) => T.edges(a, b)),
  ),
  list: fc
    .tuple(
      fc.uniqueArray(fc.integer({ min: 0, max: 12 }), { maxLength: 8 }),
      fc.array(leaf, { minLength: 8, maxLength: 8 }),
      fc.constantFrom(ROWS.one, ROWS.two, ROWS.bare),
    )
    .map(([keys, vs, row]) =>
      each(
        keys.map((k, i): Item => ({ k, v: vs[i] })),
        (it) => it.k,
        row,
      ),
    ),
}));

describe('render properties (view/02, view/03)', () => {
  it('rendering A then B gives the DOM of rendering B into a fresh root', () => {
    fc.assert(
      fc.property(fc.array(value, { minLength: 2, maxLength: 4 }), (values) => {
        const el = document.createElement('div');
        for (const v of values) {
          render(v, el);
          expect(el.innerHTML).toBe(fresh(v));
        }
      }),
      { numRuns: 400 },
    );
  });

  it('refilling one view shape gives the DOM of rendering the last fill into a fresh root', () => {
    fc.assert(
      fc.property(refills, (values) => {
        const el = document.createElement('div');
        for (const v of values) {
          render(v, el);
          expect(el.innerHTML).toBe(fresh(v));
        }
      }),
      { numRuns: 600 },
    );
  });

  it('keeps each surviving keyed row’s nodes across reorders', () => {
    const keys = fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { maxLength: 20 });
    fc.assert(
      fc.property(keys, keys, fc.constantFrom(ROWS.one, ROWS.two), (before, after, row) => {
        const view = (ks: number[]) =>
          html`<div>
            ${each(
              ks.map((k) => ({ k, v: `v${String(k)}` })),
              (it) => it.k,
              row,
            )}<b></b>
          </div>`;
        const el = mount();
        render(view(before), el);
        const nodes = new Map(before.map((k) => [k, el.querySelector(`[data-k="${String(k)}"]`)]));
        render(view(after), el);
        expect(el.innerHTML).toBe(fresh(view(after)));
        for (const k of after) {
          if (nodes.has(k)) expect(el.querySelector(`[data-k="${String(k)}"]`)).toBe(nodes.get(k));
        }
        el.remove();
      }),
      { numRuns: 300 },
    );
  });
});

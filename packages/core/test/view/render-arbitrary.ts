// fast-check generators for the renderer's properties (render-property.test.ts): a template
// *shape* (which call sites nest where) filled several times with different leaves, list keys
// and attribute values, so consecutive renders update the same instances instead of replacing
// them. Every slot can also change kind between fills (text, nothing, a nested template, an
// array), which exercises the insertion paths of root-level holes, rows and items.
import fc from 'fast-check';
import { each, html, nothing, type ChildValue } from '../../src/view/index.js';

type Attr = string | number | boolean | null | undefined | typeof nothing;

const ATTRS: readonly Attr[] = [null, undefined, nothing, '', 'x', 'y z', true, false, 0, 7];
const LEAVES: readonly ChildValue[] = ['', 'a', 'bc', null, undefined, false, nothing, 0, 42];

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
  bold: (v: ChildValue) => html`<b>${v}</b>`,
};

interface Item {
  readonly k: number;
  readonly v: ChildValue;
}

const ROWS = [
  (it: Item) => html`<li data-k=${it.k}>${it.v}</li>`,
  (it: Item) =>
    html`<dt data-k=${it.k}>${it.k}</dt>
      <dd>${it.v}</dd>`,
  (it: Item) => html`${it.v}`,
  (it: Item) => (it.k % 2 === 0 ? T.bold(it.v) : nothing),
] as const;

/** Where values go; filled by `fill` from a stream of numbers. */
export type Shape =
  | { readonly t: 'slot' }
  | { readonly t: 'para' | 'bare' | 'flag' | 'multi'; readonly c: Shape }
  | { readonly t: 'pair' | 'edges'; readonly a: Shape; readonly b: Shape }
  | { readonly t: 'list'; readonly row: number; readonly c: Shape }
  | { readonly t: 'array'; readonly items: readonly Shape[] };

export const shape: fc.Arbitrary<Shape> = fc.letrec<{ shape: Shape }>((tie) => ({
  shape: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant<Shape>({ t: 'slot' }),
    fc.record({ t: fc.constantFrom('para', 'bare', 'flag', 'multi'), c: tie('shape') }),
    fc.record({ t: fc.constantFrom('pair', 'edges'), a: tie('shape'), b: tie('shape') }),
    fc.record({ t: fc.constant('list'), row: fc.nat(ROWS.length - 1), c: tie('shape') }),
    fc.record({ t: fc.constant('array'), items: fc.array(tie('shape'), { maxLength: 3 }) }),
  ),
})).shape;

/** A reader over the fill numbers (cycling, so any shape can be filled). */
class Stream {
  private at = 0;
  constructor(private readonly nums: readonly number[]) {}
  next(): number {
    const n = this.nums[this.at % this.nums.length] ?? 0;
    this.at++;
    return n;
  }
}

function slot(s: Stream): ChildValue {
  const n = s.next();
  const kind = n % 10;
  if (kind < 6) return LEAVES[n % LEAVES.length];
  if (kind < 8) return T.bold(LEAVES[(n >> 4) % LEAVES.length]);
  if (kind < 9) return [LEAVES[(n >> 4) % LEAVES.length], T.bold('i')];
  return T.bare(LEAVES[(n >> 4) % LEAVES.length]);
}

/** The keys a list renders: a subset of 0–11 in an order picked by the stream. */
function keys(s: Stream): number[] {
  const out: number[] = [];
  const mask = s.next();
  for (let k = 0; k < 12; k++) if ((mask >> k) & 1) out.push(k);
  for (let i = out.length - 1; i > 0; i--) {
    const j = s.next() % (i + 1);
    [out[i], out[j]] = [out[j] as number, out[i] as number];
  }
  return out;
}

export function fill(sh: Shape, s: Stream): ChildValue {
  switch (sh.t) {
    case 'slot':
      return slot(s);
    case 'para':
      return T.para(ATTRS[s.next() % ATTRS.length], fill(sh.c, s));
    case 'bare':
      return T.bare(fill(sh.c, s));
    case 'flag':
      return T.flag(s.next() % 2 === 0, fill(sh.c, s));
    case 'multi':
      return T.multi(ATTRS[s.next() % ATTRS.length], ATTRS[s.next() % ATTRS.length], fill(sh.c, s));
    case 'pair':
      return T.pair(fill(sh.a, s), fill(sh.b, s));
    case 'edges':
      return T.edges(fill(sh.a, s), fill(sh.b, s));
    case 'array':
      return sh.items.slice(0, (s.next() % 4) + sh.items.length - 1).map((c) => fill(c, s));
    case 'list': {
      const items = keys(s).map((k): Item => ({ k, v: fill(sh.c, s) }));
      return each(items, (it) => it.k, ROWS[sh.row] as (it: Item) => ChildValue);
    }
  }
}

/** One shape, filled 2–4 times: what consecutive renders of one view look like. */
export const refills: fc.Arbitrary<ChildValue[]> = fc
  .tuple(
    shape,
    fc.array(fc.array(fc.nat(1 << 16), { minLength: 32, maxLength: 32 }), {
      minLength: 2,
      maxLength: 4,
    }),
  )
  .map(([sh, fills]) => fills.map((nums) => fill(sh, new Stream(nums))));

// view/03-lists.md "Reconciliation" and "Row boundaries" in Chromium: every reordering pattern
// ends with the same DOM as a fresh render, and every surviving row keeps its nodes. Rows come
// as one element, several root nodes, a single-hole template, or nothing at all.
import { afterEach, describe, expect, it } from 'vitest';
import { each, html, nothing, render, type ChildValue } from '../../src/view/index.js';
import { fresh, mount } from './render-helpers.js';

afterEach(() => {
  document.body.replaceChildren();
});

type Row = (n: number) => ChildValue;

const SHAPES: Record<string, Row> = {
  element: (n) => html`<li>${n}</li>`,
  'several roots': (n) =>
    html`<dt>${n}</dt>
      <dd>${n * 10}</dd>`,
  'text and element': (n) => html`${n}: <b>${n}</b>`,
  'single hole': (n) => html`${html`<em>${n}</em>`}`,
  'sometimes empty': (n) => (n % 3 === 0 ? nothing : html`<s>${n}</s>`),
};

const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);

const PATTERNS: Record<string, [number[], number[]]> = {
  'swap two': [range(0, 10), [0, 8, 2, 3, 4, 5, 6, 7, 1, 9]],
  'remove one': [range(0, 10), [0, 1, 2, 3, 5, 6, 7, 8, 9]],
  'insert in the middle': [range(0, 10), [0, 1, 2, 3, 4, 99, 5, 6, 7, 8, 9]],
  reverse: [range(0, 10), range(0, 10).reverse()],
  shuffle: [range(0, 12), [7, 3, 11, 0, 5, 9, 1, 10, 2, 8, 4, 6]],
  prepend: [range(0, 5), [20, 21, 0, 1, 2, 3, 4]],
  append: [range(0, 5), [0, 1, 2, 3, 4, 20, 21]],
  'replace all': [range(0, 5), range(10, 16)],
  'replace first and last': [range(0, 6), [50, 1, 2, 3, 4, 51]],
  'move forward': [range(0, 10), [0, 2, 3, 4, 5, 6, 7, 1, 8, 9]],
  'move backward': [range(0, 10), [0, 1, 7, 2, 3, 4, 5, 6, 8, 9]],
  rotate: [range(0, 8), [3, 4, 5, 6, 7, 0, 1, 2]],
  'remove and insert around moves': [range(0, 10), [9, 30, 2, 1, 4, 31, 6, 5, 0]],
  'to empty': [range(0, 4), []],
  'from empty': [[], range(0, 4)],
  'one to one other': [[1], [2]],
};

/** Each row's nodes, by key: the container's children split by each row's node count. */
function rowNodes(div: Element, row: Row, keys: number[]): Map<number, ChildNode[]> {
  const kids = [...div.childNodes];
  const out = new Map<number, ChildNode[]>();
  let at = 1; // after <b>head</b>
  for (const n of keys) {
    const alone = document.createElement('div');
    render(row(n), alone);
    out.set(n, kids.slice(at, at + alone.childNodes.length));
    at += alone.childNodes.length;
  }
  return out;
}

function check(row: Row, before: number[], after: number[]): void {
  const view = (ns: number[]) => html`<div><b>head</b>${each(ns, (n) => n, row)}<b>tail</b></div>`;
  const el = mount();
  render(view(before), el);
  const div = el.firstElementChild as Element;
  const old = rowNodes(div, row, before);
  render(view(after), el);
  expect(el.innerHTML).toBe(fresh(view(after)));
  const now = rowNodes(div, row, after);
  for (const n of after) {
    const kept = old.get(n);
    if (kept === undefined) continue;
    const nodes = now.get(n) ?? [];
    expect(nodes.length).toBe(kept.length);
    nodes.forEach((node, k) => {
      expect(node).toBe(kept[k]);
    });
  }
}

describe('reconciliation (view/03 "Reconciliation")', () => {
  for (const [shape, row] of Object.entries(SHAPES)) {
    for (const [name, [before, after]] of Object.entries(PATTERNS)) {
      it(`${name} (${shape} rows)`, () => {
        check(row, before, after);
      });
    }
  }

  it('re-renders changed rows while they move, and replaces a row whose template changed', () => {
    const el = mount();
    const A = (r: { id: number; v: string }) => html`<li class="a">${r.v}</li>`;
    const B = (r: { id: number; v: string }) => html`<li class="b">${r.v}</li>`;
    const row = (r: { id: number; v: string; b?: boolean }) => (r.b === true ? B(r) : A(r));
    const view = (l: { id: number; v: string; b?: boolean }[]) =>
      html`<ul>
        ${each(l, (r) => r.id, row)}
      </ul>`;
    const one = { id: 1, v: 'one' };
    const two = { id: 2, v: 'two' };
    const three = { id: 3, v: 'three' };
    render(view([one, two, three]), el);
    const [li1, , li3] = [...el.querySelectorAll('li')];
    const next = [three, { ...one, v: 'ONE' }, { ...two, b: true }];
    render(view(next), el);
    expect(el.innerHTML).toBe(fresh(view(next)));
    const now = [...el.querySelectorAll('li')];
    expect(now[0]).toBe(li3);
    expect(now[1]).toBe(li1);
    expect(now[2]?.className).toBe('b');
  });

  it('keeps nested lists keyed inside moving rows', () => {
    const el = mount();
    const group = (g: { id: number; kids: number[] }) =>
      html`<section>
        <h2>${g.id}</h2>
        ${each(
          g.kids,
          (k) => k,
          (k) => html`<i>${k}</i>`,
        )}
      </section>`;
    const view = (gs: { id: number; kids: number[] }[]) =>
      html`<main>${each(gs, (g) => g.id, group)}</main>`;
    const a = { id: 1, kids: [1, 2, 3] };
    const b = { id: 2, kids: [4, 5] };
    render(view([a, b]), el);
    const i3 = el.querySelectorAll('i')[2];
    const next = [
      { ...b, kids: [5, 4] },
      { ...a, kids: [3, 1] },
    ];
    render(view(next), el);
    expect(el.innerHTML).toBe(fresh(view(next)));
    expect(el.querySelectorAll('i')[2]).toBe(i3);
  });
});

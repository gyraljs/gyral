// Candidate (a) for view/03-lists.md "Reconciliation": a key map over the whole reordered
// window, then the longest-increasing-subsequence move plan. Swapped in for the benchmark with
// vi.mock (lists-lis.bench.test.ts); the shipped reorder.ts is the hybrid that won.
import type { ChildPart } from '../src/view/render/child-part.js';
import { lis, placeRows } from '../src/view/render/place.js';
import { firstFrom, newRow, updateRow, type List } from '../src/view/render/rows.js';
import type { ListResult } from '../src/view/render/values.js';

export function reorder(
  part: ChildPart,
  list: List,
  l: ListResult,
  rows: ChildPart[],
  s: number,
  oe: number,
  ne: number,
): void {
  const { items, key } = l;
  const old = list.rows;
  const byKey = new Map<unknown, number>();
  for (let j = s; j <= oe; j++) byKey.set((old[j] as ChildPart).key, j);
  const src = new Int32Array(ne - s + 1);
  const reused = new Uint8Array(oe - s + 1);
  let frag: DocumentFragment | null = null;
  let moved = false;
  let last = -1;
  for (let i = s; i <= ne; i++) {
    const item = items[i];
    const k = key(item);
    const j = byKey.get(k);
    if (j === undefined) {
      frag ??= document.createDocumentFragment();
      rows.push(newRow(null, frag, l, item, k, i));
      src[i - s] = -1;
      continue;
    }
    byKey.delete(k);
    reused[j - s] = 1;
    src[i - s] = j;
    if (j < last) moved = true;
    else last = j;
    const row = old[j] as ChildPart;
    updateRow(row, item, l);
    rows.push(row);
  }
  for (let j = s; j <= oe; j++) if (reused[j - s] === 0) (old[j] as ChildPart).clear();
  if (!moved && frag === null) return;
  placeRows(
    part.parent(),
    rows,
    s,
    ne,
    src,
    moved ? lis(src) : undefined,
    firstFrom(old, oe + 1, part),
  );
  if (frag === null) return;
  for (let i = s; i <= ne; i++) {
    if ((src[i - s] as number) >= 0) continue;
    const row = rows[i] as ChildPart;
    row.parentNode = null;
    row.owner = list;
  }
}

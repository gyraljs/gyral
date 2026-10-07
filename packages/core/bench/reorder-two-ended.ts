// Candidate (b) for view/03-lists.md "Reconciliation": a two-ended scan that moves rows as it
// matches them (head/tail, crossed both ways), with a key map for the rest, moving each found
// row before the current old head. Swapped in for the benchmark with vi.mock
// (lists-two-ended.bench.test.ts); the shipped reorder.ts is the hybrid that won.
import type { ChildPart } from '../src/view/render/child-part.js';
import { canMove, moveRange } from '../src/view/render/nodes.js';
import { firstFrom, newRow, updateRow, type List } from '../src/view/render/rows.js';
import type { ListResult } from '../src/view/render/values.js';

const moveRow = (parent: Node, row: ChildPart, ref: Node | null, move: boolean): void => {
  const first = row.first();
  if (first !== null) moveRange(parent, first, row.last() as Node, ref, move);
};

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
  const parent = part.parent();
  const move = canMove(parent);
  const keys: unknown[] = [];
  for (let i = s; i <= ne; i++) keys.push(key(items[i]));
  const src = new Int32Array(ne - s + 1).fill(-1);
  const pending: (ChildPart | undefined)[] = old.slice(s, oe + 1);
  let byKey: Map<unknown, number> | undefined;
  let os = 0;
  let oEnd = pending.length - 1;
  let ns = s;
  let nEnd = ne;
  while (os <= oEnd && ns <= nEnd) {
    const a = pending[os];
    const b = pending[oEnd];
    if (a === undefined) os++;
    else if (b === undefined) oEnd--;
    else if (keys[ns - s] === a.key) src[ns++ - s] = s + os++;
    else if (keys[nEnd - s] === b.key) src[nEnd-- - s] = s + oEnd--;
    else if (keys[nEnd - s] === a.key) {
      moveRow(parent, a, (b.last() as Node).nextSibling, move);
      src[nEnd-- - s] = s + os++;
    } else if (keys[ns - s] === b.key) {
      moveRow(parent, b, a.first(), move);
      src[ns++ - s] = s + oEnd--;
    } else {
      if (byKey === undefined) {
        byKey = new Map();
        for (let j = os; j <= oEnd; j++) byKey.set((pending[j] as ChildPart).key, j);
      }
      const j = byKey.get(keys[ns - s]);
      const found = j === undefined || j < os || j > oEnd ? undefined : pending[j];
      if (found !== undefined && j !== undefined) {
        moveRow(parent, found, a.first(), move);
        pending[j] = undefined;
        src[ns - s] = s + j;
      }
      ns++;
    }
  }
  const reused = new Uint8Array(oe - s + 1);
  let frag: DocumentFragment | null = null;
  for (let i = s; i <= ne; i++) {
    const j = src[i - s] as number;
    if (j < 0) {
      frag ??= document.createDocumentFragment();
      rows.push(newRow(null, frag, l, items[i], keys[i - s], i));
      continue;
    }
    reused[j - s] = 1;
    const row = old[j] as ChildPart;
    updateRow(row, items[i], l);
    rows.push(row);
  }
  for (let j = s; j <= oe; j++) if (reused[j - s] === 0) (old[j] as ChildPart).clear();
  if (frag === null) return;
  let ref = firstFrom(old, oe + 1, part);
  for (let i = ne; i >= s; i--) {
    const row = rows[i] as ChildPart;
    const first = row.first();
    if ((src[i - s] as number) < 0) {
      if (first !== null) moveRange(parent, first, row.last() as Node, ref, false);
      row.parentNode = null;
      row.owner = list;
    }
    if (first !== null) ref = first;
  }
}

// Reordering the middle of a list (view/03-lists.md "Reconciliation", steps 1–3): old rows
// `s…oe` become new rows `s…ne` once the common prefix and suffix are trimmed. Keys are matched
// by a two-ended scan first (head and tail, crossed both ways), so swaps, single moves and
// reversals need no map: the rows matched in place stay and the crossed ones move. When the
// scan gets stuck, a key map matches the rest and the rows on a longest increasing subsequence
// of old positions stay. Reused rows re-render in document order before anything moves; gone
// rows are removed. The benchmark behind this choice is recorded in the spec.
import type { ChildPart } from './child-part.js';
import { clearList, createRows } from './list.js';
import { lis, placeRows } from './place.js';
import { firstFrom, newRow, updateRow, type List } from './rows.js';
import type { ListResult } from './values.js';

/** The matching: old positions per new row (-1: new), what stays, and how many were found. */
interface Match {
  readonly src: Int32Array;
  /** Rows to keep in place; undefined: compute from `src` (the key map was needed). */
  keep: Uint8Array | undefined;
  found: number;
}

function match(
  old: readonly ChildPart[],
  keys: readonly unknown[],
  s: number,
  oe: number,
  ne: number,
): Match {
  const src = new Int32Array(ne - s + 1).fill(-1);
  const keep = new Uint8Array(ne - s + 1);
  const m: Match = { src, keep, found: 0 };
  let os = s;
  let ns = s;
  for (; os <= oe && ns <= ne; m.found++) {
    const head = (old[os] as ChildPart).key;
    const tail = (old[oe] as ChildPart).key;
    if (keys[ns - s] === head) {
      keep[ns - s] = 1;
      src[ns++ - s] = os++;
    } else if (keys[ne - s] === tail) {
      keep[ne - s] = 1;
      src[ne-- - s] = oe--;
    } else if (keys[ne - s] === head) src[ne-- - s] = os++;
    else if (keys[ns - s] === tail) src[ns++ - s] = oe--;
    else break;
  }
  if (os > oe || ns > ne) return m;
  m.keep = undefined;
  const byKey = new Map<unknown, number>();
  for (let j = os; j <= oe; j++) byKey.set((old[j] as ChildPart).key, j);
  for (let i = ns; i <= ne; i++) {
    const key = keys[i - s];
    const j = byKey.get(key);
    if (j === undefined) continue; // a new key (or, in production, a later duplicate)
    byKey.delete(key);
    src[i - s] = j;
    m.found++;
  }
  return m;
}

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
  const keys: unknown[] = [];
  for (let i = s; i <= ne; i++) keys.push(key(items[i]));
  const m = match(old, keys, s, oe, ne);
  const end = firstFrom(old, oe + 1, part);
  if (m.found === 0) {
    // Nothing reused: drop the old rows (all at once when they are the whole list).
    if (s === 0 && oe === old.length - 1) clearList(part, list);
    else for (let j = s; j <= oe; j++) (old[j] as ChildPart).clear();
    createRows(part, list, l, rows, s, ne, end, keys);
    return;
  }
  const src = m.src;
  const reused = new Uint8Array(oe - s + 1);
  let frag: DocumentFragment | null = null;
  let moved = false;
  let last = -1;
  for (let i = s; i <= ne; i++) {
    const j = src[i - s] as number;
    if (j < 0) {
      frag ??= document.createDocumentFragment();
      rows.push(newRow(null, frag, l, items[i], keys[i - s], i));
      continue;
    }
    reused[j - s] = 1;
    if (j < last) moved = true;
    else last = j;
    const row = old[j] as ChildPart;
    updateRow(row, items[i], l);
    rows.push(row);
  }
  for (let j = s; j <= oe; j++) if (reused[j - s] === 0) (old[j] as ChildPart).clear();
  if (!moved && frag === null) return;
  const keep = moved ? (m.keep ?? lis(src)) : undefined;
  placeRows(part.parent(), rows, s, ne, src, keep, end);
  if (frag === null) return;
  for (let i = s; i <= ne; i++) {
    if ((src[i - s] as number) >= 0) continue;
    const row = rows[i] as ChildPart;
    row.parentNode = null;
    row.owner = list;
  }
}

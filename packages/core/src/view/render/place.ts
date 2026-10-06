// Putting a list's reordered rows in place with the fewest DOM moves (view/03-lists.md
// "Reconciliation", step 3): the rows whose old positions form a longest increasing
// subsequence (or that a two-ended scan matched in place) stay; every other reused row moves,
// and new rows are inserted. The benchmark behind the plan is recorded in the spec.
import { canMove, moveRange } from './nodes.js';

/** A row, as far as placing it goes. */
export interface Placeable {
  first(): Node | null;
  last(): Node | null;
}

/**
 * Marks (1) the positions of one longest strictly increasing subsequence of `src`, ignoring
 * negative entries (new rows). O(n log n).
 */
export function lis(src: Int32Array): Uint8Array {
  const n = src.length;
  const tails = new Int32Array(n);
  const prev = new Int32Array(n);
  let len = 0;
  for (let i = 0; i < n; i++) {
    const v = src[i] as number;
    if (v < 0) continue;
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((src[tails[mid] as number] as number) < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? (tails[lo - 1] as number) : -1;
    tails[lo] = i;
    if (lo === len) len++;
  }
  const keep = new Uint8Array(n);
  for (let k = len > 0 ? (tails[len - 1] as number) : -1; k >= 0; k = prev[k] as number) {
    keep[k] = 1;
  }
  return keep;
}

/** The first node of `rows[from…to]` (already placed), or `end`. */
function nodeAfter(
  rows: readonly Placeable[],
  from: number,
  to: number,
  end: Node | null,
): Node | null {
  for (let i = from; i <= to; i++) {
    const node = (rows[i] as Placeable).first();
    if (node !== null) return node;
  }
  return end;
}

/**
 * Places `rows[from..to]` before `end` in `parent`, back to front. `src[i - from]` is the old
 * position of a reused row, or -1 for a new row (its nodes wait in a fragment). Reused rows
 * marked in `keep` stay (all of them when `keep` is undefined: they are already in order); the
 * others move. Rows that stay cost two array reads; only a row that moves looks up its
 * reference node.
 */
export function placeRows(
  parent: Node,
  rows: readonly Placeable[],
  from: number,
  to: number,
  src: Int32Array,
  keep: Uint8Array | undefined,
  end: Node | null,
): void {
  const move = canMove(parent);
  for (let i = to; i >= from; i--) {
    const fresh = (src[i - from] as number) < 0;
    if (!fresh && (keep === undefined || keep[i - from] === 1)) continue;
    const row = rows[i] as Placeable;
    const first = row.first();
    if (first === null) continue;
    const ref = nodeAfter(rows, i + 1, to, end);
    moveRange(parent, first, row.last() as Node, ref, !fresh && move);
  }
}

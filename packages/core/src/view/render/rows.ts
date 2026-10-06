// Rows of lists and arrays (view/03-lists.md "Row skipping", "Row boundaries"): the list that
// owns them (and resolves their positions), row skipping by item identity and a shallow pick
// comparison, and row creation. Shared by list.ts and the reordering step (reorder.ts).
import { ChildPart, type Owner } from './child-part.js';
import type { ListResult } from './values.js';

/** The rows of a list or the items of an array, owned by one child part. */
export class List implements Owner {
  readonly part: ChildPart;
  rows: ChildPart[];
  /** While rows are created into a fragment: they append to it. */
  building: DocumentFragment | null;
  /** Where the development re-evaluation check continues (dev-check.ts). */
  cursor: number;

  constructor(part: ChildPart) {
    this.part = part;
    this.rows = [];
    this.building = null;
    this.cursor = 0;
  }

  parentFor(): Node {
    return this.building ?? this.part.parent();
  }

  endFor(index: number): Node | null {
    return this.building !== null ? null : firstFrom(this.rows, index + 1, this.part);
  }

  first(): Node | null {
    const rows = this.rows;
    for (let i = 0; i < rows.length; i++) {
      const node = (rows[i] as ChildPart).first();
      if (node !== null) return node;
    }
    return null;
  }

  last(): Node | null {
    const rows = this.rows;
    for (let i = rows.length - 1; i >= 0; i--) {
      const node = (rows[i] as ChildPart).last();
      if (node !== null) return node;
    }
    return null;
  }
}

/** The first node of `rows[from…]`, or the end of the list's part. */
export function firstFrom(rows: readonly ChildPart[], from: number, part: ChildPart): Node | null {
  for (let j = from; j < rows.length; j++) {
    const node = (rows[j] as ChildPart).first();
    if (node !== null) return node;
  }
  return part.end();
}

/** `Object.is`, or for arrays and plain objects the same entries by `Object.is` (one level). */
export function samePick(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  const proto = Object.getPrototypeOf(a) as unknown;
  if ((proto !== Object.prototype && proto !== null) || Object.getPrototypeOf(b) !== proto) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (!Object.hasOwn(b, k)) return false;
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

export function updateRow(row: ChildPart, item: unknown, l: ListResult): void {
  const picked = l.pick === undefined ? undefined : l.pick(item);
  if (item === row.item && samePick(picked, row.picked)) return;
  row.item = item;
  row.picked = picked;
  row.commit(l.row(item, picked));
}

/** A new row: open (positioned by `owner`), or appended to `parent` until placed. */
export function newRow(
  owner: List | null,
  parent: Node | null,
  l: ListResult,
  item: unknown,
  key: unknown,
  index: number,
): ChildPart {
  const row = new ChildPart(parent, null, owner, index, false, -1);
  const picked = l.pick === undefined ? undefined : l.pick(item);
  row.key = key;
  row.item = item;
  row.picked = picked;
  row.commit(l.row(item, picked));
  return row;
}

// Lists in child holes: `each` (view/03-lists.md "Reconciliation", "Fast paths") and
// positional arrays (view/02-bindings.md "Child values"). Rows are child parts tracked by their
// node range, with no markers. Fast paths: create into empty (one fragment), clear
// (replaceChildren when the list is its parent's only content), the common prefix and suffix,
// insert-only (append, prepend, insert) and remove-only. What remains is reordered by
// reorder.ts. Rows commit in document order. `each` is here: its result carries `commitList`,
// so the keyed path (this, rows.ts, reorder.ts, place.ts) is bundled only by apps that call it.
import { DEV } from '#view-dev';
import { ChildPart, EMPTY, ITEMS, LIST } from './child-part.js';
import { checkKeys, recheckRows } from './dev-check.js';
import { reorder } from './reorder.js';
import { firstFrom, List, newRow, updateRow } from './rows.js';
import { EACH, type ChildValue, type ListResult } from './values.js';

export { List } from './rows.js';

function listOf(part: ChildPart, kind: number): List {
  if (part.kind === kind) return part.content as List;
  if (part.kind !== EMPTY) part.clear();
  const list = new List(part);
  part.kind = kind;
  part.content = list;
  return list;
}

/** Removes every row; the list's part keeps its (now empty) list. */
export function clearList(part: ChildPart, list: List): void {
  if (part.sole && part.parentNode !== null) (part.parentNode as Element).replaceChildren();
  else for (const row of list.rows) row.clear();
  list.rows = [];
}

/**
 * Creates rows for `l.items[from…to]` (keys from `keys[i - from]` when given) into one
 * fragment, pushes them onto `rows` and inserts the fragment before `end`.
 */
export function createRows(
  part: ChildPart,
  list: List,
  l: ListResult,
  rows: ChildPart[],
  from: number,
  to: number,
  end: Node | null,
  keys?: readonly unknown[],
): void {
  const frag = document.createDocumentFragment();
  list.building = frag;
  try {
    for (let i = from; i <= to; i++) {
      const item = l.items[i];
      const key = keys === undefined ? l.key(item) : keys[i - from];
      rows.push(newRow(list, null, l, item, key, i));
    }
  } finally {
    list.building = null;
  }
  part.parent().insertBefore(frag, end);
}

/**
 * A keyed list (view/03-lists.md). `key` must give each item a unique string or number; `row`
 * must depend only on its arguments: a row re-renders only when its item object or its `pick`
 * result changes.
 */
export function each<T>(
  items: readonly T[],
  key: (item: T) => string | number,
  row: (item: T) => ChildValue,
): ListResult;
export function each<T, P>(
  items: readonly T[],
  key: (item: T) => string | number,
  row: (item: T, picked: P) => ChildValue,
  pick: (item: T) => P,
): ListResult;
export function each<T, P>(
  items: readonly T[],
  key: (item: T) => string | number,
  row: (item: T, picked: P) => ChildValue,
  pick?: (item: T) => P,
): ListResult {
  if (DEV && typeof key !== 'function') {
    throw new TypeError(
      'gyral: each() needs a key function as its second argument: ' +
        'each(items, (x) => x.id, Row) (docs/design-docs/view/03-lists.md "Keys", rule 9).',
    );
  }
  return {
    [EACH]: commitList,
    items,
    key: key as (item: unknown) => unknown,
    row: row as (item: unknown, picked: unknown) => unknown,
    pick: pick as ((item: unknown) => unknown) | undefined,
  };
}

function commitList(part: ChildPart, l: ListResult): void {
  const list = listOf(part, LIST);
  const n = l.items.length;
  if (DEV) checkKeys(l.items, l.key);
  if (list.rows.length === 0) {
    if (n > 0) {
      const rows: ChildPart[] = [];
      createRows(part, list, l, rows, 0, n - 1, part.end());
      list.rows = rows;
    }
  } else if (n === 0) clearList(part, list);
  else reconcile(part, list, l);
  if (DEV) recheckRows(list, l);
}

function reconcile(part: ChildPart, list: List, l: ListResult): void {
  const { items, key } = l;
  const old = list.rows;
  const n = items.length;
  const on = old.length;
  const m = n < on ? n : on;
  let s = 0;
  for (; s < m; s++) {
    const item = items[s];
    const row = old[s] as ChildPart;
    if (key(item) !== row.key) break;
    updateRow(row, item, l);
  }
  if (s === n && s === on) return;
  let oe = on - 1;
  let ne = n - 1;
  while (oe >= s && ne >= s && key(items[ne]) === (old[oe] as ChildPart).key) {
    oe--;
    ne--;
  }
  const rows = old.slice(0, s);
  if (s > oe) createRows(part, list, l, rows, s, ne, firstFrom(old, oe + 1, part));
  else if (s > ne) for (let j = s; j <= oe; j++) (old[j] as ChildPart).clear();
  else reorder(part, list, l, rows, s, oe, ne);
  for (let j = oe + 1; j < on; j++) rows.push(old[j] as ChildPart);
  list.rows = rows;
  for (let i = s; i < n; i++) (rows[i] as ChildPart).index = i;
  for (let i = ne + 1; i < n; i++) updateRow(rows[i] as ChildPart, items[i], l);
}

/** A positional array: items reused by index (view/02-bindings.md "Child values"). */
export function commitItems(part: ChildPart, values: readonly unknown[]): void {
  const list = listOf(part, ITEMS);
  const rows = list.rows;
  const n = values.length;
  if (n === 0) {
    if (rows.length > 0) clearList(part, list);
    return;
  }
  const common = n < rows.length ? n : rows.length;
  for (let i = 0; i < common; i++) (rows[i] as ChildPart).commit(values[i]);
  if (n > rows.length) {
    const end = part.end();
    const frag = document.createDocumentFragment();
    list.building = frag;
    try {
      for (let i = rows.length; i < n; i++) {
        const row = new ChildPart(null, null, list, i, false, -1);
        rows.push(row);
        row.commit(values[i]);
      }
    } finally {
      list.building = null;
    }
    part.parent().insertBefore(frag, end);
  } else while (rows.length > n) (rows.pop() as ChildPart).clear();
}

// Development checks for lists (view/03-lists.md "Keys", "Rows must be pure") and skipped
// views (view/04 "Marking", G0017). Keys must be unique strings or numbers. Skipped rows are
// re-evaluated and compared with what is committed (template, by id or identity, and values,
// recursively); a difference warns once per row function. At most 200 rows are checked per
// flush (per render call outside one), rotating through each list. Values compare by what they
// render, never by identity (gyral-nyy): plain objects and arrays by value (`sameValue`), and a
// list row whose item or pick changed is rendered again and compared. Only reached under
// `if (DEV)`.
import { DEV } from '#view-dev';
import { isTemplateResult, templateOf } from '../template.js';
import {
  BOOL,
  CHECKED,
  HOOK,
  MULTI,
  OPEN,
  STATE,
  TEXTAREA,
  textOf,
  TITLE,
  truthy,
  type AttrPart,
  type Part,
} from './attr-parts.js';
import { ChildPart, EMPTY, INSTANCE, ITEMS, LIST, RAW, TEXT } from './child-part.js';
import type { RawRange } from './raw.js';
import { hookSpec, type HookResult } from './hooks.js';
import type { Instance } from './instance.js';
import { samePick, type List } from './rows.js';
import { isList, rawHtml, type ListResult } from './values.js';
import { badKey, warnImpureRow } from './warn.js';

/** Rows re-evaluated per flush (render.ts `renderBatch`), or per render call outside one. */
export const ROW_CHECKS = 200;
let budget = ROW_CHECKS;
const warned = new WeakSet<object>();

/**
 * Skipped renders re-checked per flush (gyral-337.1): every one up to this many, then a
 * window that moves along the flush's order from one flush to the next.
 */
export const VIEW_CHECKS = 50;
/**
 * List rows the comparison renders again per flush, where the item or pick changed (sameList);
 * past them, a row counts as unchanged: unchecked, never a false warning.
 */
export const VIEW_ROWS = 1000;
let views = { budget: VIEW_CHECKS, now: 0, before: 0, round: 0, rows: VIEW_ROWS };

/** Called at the start of each flush, or of a `render` call outside one. */
export function resetRowChecks(): void {
  budget = ROW_CHECKS;
  const round = views.round + 1;
  views = { budget: VIEW_CHECKS, now: 0, before: views.now, round, rows: VIEW_ROWS };
}

/**
 * Development: whether to re-run the view of a host whose render was skipped (its state, props
 * and stores unchanged) and compare it with what is committed. Every skipped render while the
 * flush's budget lasts; when the last flush skipped more, a window of VIEW_CHECKS of them that
 * moves each flush, so every host is checked within a few flushes.
 */
export function checkSkippedView(): boolean {
  const k = views.now++;
  if (views.budget <= 0) return false;
  const n = views.before;
  if (n > VIEW_CHECKS && k < n && (k - ((views.round * VIEW_CHECKS) % n) + n) % n >= VIEW_CHECKS) {
    return false;
  }
  views.budget--;
  return true;
}

/** Keys are unique strings or numbers. Guarded here too: the lazy hydration chunk calls it. */
export function checkKeys(items: readonly unknown[], key: (item: unknown) => unknown): void {
  if (!DEV) return;
  const seen = new Set<unknown>();
  for (let i = 0; i < items.length; i++) {
    const k = key(items[i]);
    if (typeof k !== 'string' && typeof k !== 'number') badKey(k, i, false);
    if (seen.has(k)) badKey(k, i, true);
    seen.add(k);
  }
}

export function recheckRows(list: List, l: ListResult): void {
  const rows = list.rows;
  const n = rows.length;
  if (n === 0 || budget <= 0 || warned.has(l.row)) return;
  const count = Math.min(budget, n);
  budget -= count;
  let at = list.cursor % n;
  for (let k = 0; k < count; k++) {
    const row = rows[at] as ChildPart;
    if (!sameChild(row, l.row(row.item, row.picked))) {
      warned.add(l.row);
      warnImpureRow(l.row);
      break;
    }
    at = (at + 1) % n;
  }
  list.cursor = at;
}

/** Whether rendering `value` into `part` would change nothing. */
export function sameChild(part: ChildPart, value: unknown): boolean {
  if (typeof value === 'string' || typeof value === 'number') {
    return part.kind === TEXT && Object.is(part.value, value);
  }
  if (typeof value === 'object' && value !== null) {
    if (isTemplateResult(value)) {
      if (part.kind !== INSTANCE) return false;
      const committed = part.content as Instance;
      const template = templateOf(value);
      return (
        (committed.template === template ||
          (template.id !== undefined && template.id === committed.template.id)) &&
        committed.parts.every((p) => samePart(p, value.values))
      );
    }
    if (isList(value)) return part.kind === LIST && sameList(part.content as List, value);
    if (Array.isArray(value)) {
      if (part.kind !== ITEMS) return false;
      const rows = (part.content as List).rows;
      return rows.length === value.length && rows.every((r, i) => sameChild(r, value[i]));
    }
    const html = rawHtml(value);
    if (html !== undefined) return part.kind === RAW && (part.content as RawRange).html === html;
  }
  return part.kind === EMPTY;
}

function samePart(p: Part, values: readonly unknown[]): boolean {
  if (p instanceof ChildPart) return sameChild(p, values[p.at]);
  const part = p as AttrPart;
  const v = values[part.at];
  switch (part.kind) {
    case MULTI:
      return (part.pieces ?? []).every((piece, i) => sameValue(piece, values[part.at + i]));
    case BOOL:
    case CHECKED:
    case STATE:
    case OPEN:
      return part.value === truthy(v);
    case TITLE:
    case TEXTAREA:
      return part.value === textOf(part, v);
    case HOOK: {
      const spec = hookSpec(v);
      if (spec === undefined) return part.spec === null;
      return spec === part.spec && sameValue((v as HookResult).args, part.args);
    }
    default:
      // ATTR, PROP and VALUE keep the raw committed value.
      return sameValue(part.value, v);
  }
}

/**
 * Whether `l` renders what `list` shows: the same keys in order, and each row the same. A row
 * whose item and pick are unchanged would be skipped (the row check covers it); any other row
 * is rendered again and compared, so items rebuilt in the view, or a `keyed()` template, are
 * the same when they render the same.
 */
function sameList(list: List, l: ListResult): boolean {
  const rows = list.rows;
  if (rows.length !== l.items.length) return false;
  return rows.every((row, i) => {
    const item = l.items[i];
    if (!Object.is(row.key, l.key(item))) return false;
    const picked = l.pick === undefined ? undefined : l.pick(item);
    if (row.item === item && (l.equals ?? samePick)(row.picked, picked)) return true;
    if (views.rows <= 0) return true;
    views.rows--;
    return sameChild(row, l.row(item, picked));
  });
}

/** Entries `sameValue` compares per value, and how deep; past either, the rest count as equal. */
const DATA_ENTRIES = 1000;
const DATA_DEPTH = 16;

const isData = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return Array.isArray(value) || proto === Object.prototype || proto === null;
};

/**
 * Whether two bound values render the same: `Object.is`, or for plain objects and arrays the
 * same keys with values compared the same way, so a fresh `{ n: s.n }` or `s.items.slice()`
 * matches what it replaced. Bounded (DATA_ENTRIES, DATA_DEPTH): past the bound, unchecked
 * values count as equal. Anything else (a Date, a Map, a class instance) by `Object.is`.
 */
function sameValue(a: unknown, b: unknown): boolean {
  let left = DATA_ENTRIES;
  const same = (x: unknown, y: unknown, depth: number): boolean => {
    if (Object.is(x, y)) return true;
    if (!isData(x) || !isData(y) || Array.isArray(x) !== Array.isArray(y)) return false;
    if (depth >= DATA_DEPTH) return true;
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    for (const k of keys) {
      if (--left < 0) return true;
      if (!Object.hasOwn(y, k) || !same(x[k], y[k], depth + 1)) return false;
    }
    return true;
  };
  return same(a, b, 0);
}

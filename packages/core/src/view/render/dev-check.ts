// Development checks for lists (view/03-lists.md "Keys", "Rows must be pure"). Keys must be
// unique strings or numbers. Skipped rows are re-evaluated and compared with what is committed
// (template id and values, recursively); a difference warns once per row function. At most 200
// rows are checked per render call, rotating through each list. Only reached under `if (DEV)`.
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
import { ChildPart, EMPTY, INSTANCE, ITEMS, LIST, RAW, TEXT, type RawRange } from './child-part.js';
import { hookSpec, sameArgs, type HookResult } from './hooks.js';
import type { Instance } from './instance.js';
import { samePick, type List } from './rows.js';
import { isList, rawHtml, type ListResult } from './values.js';
import { badKey, warnImpureRow } from './warn.js';

/** Rows re-evaluated per render call. */
export const ROW_CHECKS = 200;
let budget = ROW_CHECKS;
const warned = new WeakSet<object>();

/** Called by `render` at the start of each call. */
export function resetRowChecks(): void {
  budget = ROW_CHECKS;
}

export function checkKeys(items: readonly unknown[], key: (item: unknown) => unknown): void {
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
      const instance = part.content as Instance;
      return (
        instance.template.id === templateOf(value).id &&
        instance.parts.every((p) => samePart(p, value.values))
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
      return (part.pieces ?? []).every((piece, i) => Object.is(piece, values[part.at + i]));
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
      return spec === part.spec && sameArgs((v as HookResult).args, part.args);
    }
    default:
      // ATTR, PROP and VALUE keep the raw committed value.
      return Object.is(part.value, v);
  }
}

function sameList(list: List, l: ListResult): boolean {
  const rows = list.rows;
  if (rows.length !== l.items.length) return false;
  return rows.every((row, i) => {
    const item = l.items[i];
    return (
      row.item === item &&
      Object.is(row.key, l.key(item)) &&
      samePick(row.picked, l.pick === undefined ? undefined : l.pick(item))
    );
  });
}

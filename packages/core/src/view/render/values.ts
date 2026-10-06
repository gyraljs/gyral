// Child values besides text and templates (view/02-bindings.md "Child values", "`raw(html)`",
// "`nothing`") and the result of `each` (view/03-lists.md "The API"). Each is recognised by a
// module-private symbol, so data parsed from JSON can never pass for one.
import { DEV } from '#view-dev';
import type { TemplateResult } from '../template.js';

/** Renders nothing in a child hole; removes the attribute in an attribute hole. */
export const nothing: unique symbol = Symbol('gyral.nothing');

/** Internal: "never committed", so a part's first commit always writes. */
export const UNSET: unique symbol = Symbol('gyral.unset');

const RAW: unique symbol = Symbol('gyral.raw');
const LIST: unique symbol = Symbol('gyral.each');

/** Trusted markup for a child hole: what `raw(html)` returns. */
export interface RawResult {
  readonly [RAW]: string;
}

/** A keyed list for a child hole: what `each(…)` returns. */
export interface ListResult {
  readonly [LIST]: true;
  readonly items: readonly unknown[];
  readonly key: (item: unknown) => unknown;
  readonly row: (item: unknown, picked: unknown) => unknown;
  readonly pick: ((item: unknown) => unknown) | undefined;
}

/** Everything a child hole accepts (view/02-bindings.md "Child values"). */
export type ChildValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | typeof nothing
  | TemplateResult
  | ListResult
  | RawResult
  | readonly ChildValue[];

/**
 * Trusted markup from your own code (Markdown output, JSON-LD), parsed in a child hole and
 * re-parsed only when the string changes. Never pass user input.
 */
export function raw(html: string): RawResult {
  return { [RAW]: html };
}

/** The markup of a `raw()` value, or undefined for anything else. */
export const rawHtml = (value: object): string | undefined =>
  RAW in value ? (value as RawResult)[RAW] : undefined;

export const isList = (value: object): value is ListResult => LIST in value;

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
    [LIST]: true,
    items,
    key: key as (item: unknown) => unknown,
    row: row as (item: unknown, picked: unknown) => unknown,
    pick: pick as ((item: unknown) => unknown) | undefined,
  };
}

// Child values besides text and templates (view/02-bindings.md "Child values", "`raw(html)`",
// "`nothing`") and the result of `each` (view/03-lists.md "The API"). Each is recognised by a
// symbol, so data parsed from JSON can never pass for one. `each` lives in list.ts and `raw` in
// raw.ts: their results carry the code that commits them, so an app that never calls one
// doesn't bundle that code.
import type { TemplateResult } from '../template.js';
import type { ChildPart } from './child-part.js';

/** Renders nothing in a child hole; removes the attribute in an attribute hole. */
export const nothing: unique symbol = Symbol('gyral.nothing');

/** Internal: "never committed", so a part's first commit always writes. */
export const UNSET: unique symbol = Symbol('gyral.unset');

/** Internal: the key of `raw`'s result; its value is the function that commits the markup. */
export const MARKUP: unique symbol = Symbol('gyral.raw');
/** Internal: the key of `each`'s result; its value is the function that commits the list. */
export const EACH: unique symbol = Symbol('gyral.each');

/** Trusted markup for a child hole: what `raw(html)` returns. */
export interface RawResult {
  readonly [MARKUP]: (part: ChildPart, html: string) => void;
  readonly html: string;
}

/** A keyed list for a child hole: what `each(…)` returns. */
export interface ListResult {
  readonly [EACH]: (part: ChildPart, list: ListResult) => void;
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

export const isRaw = (value: object): value is RawResult => MARKUP in value;

/** The markup of a `raw()` value, or undefined for anything else. */
export const rawHtml = (value: object): string | undefined =>
  isRaw(value) ? value.html : undefined;

export const isList = (value: object): value is ListResult => EACH in value;

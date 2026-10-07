// The templates a render instantiates, reported to the caller of `render`/`hydrate` (view/02
// "Commit order"). Core uses it to listen only for the intent events a component's markup names
// (view/05-element.md "Intent events"). Reporting costs one comparison per instance when no
// one listens, and one call per run of instances of the same template when someone does.
import type { PartSpec } from '../normalize/types.js';

/** What is reported: a template object, or `raw()` markup as `{ html }`. */
export interface Markup {
  readonly html: string;
  readonly parts?: readonly PartSpec[];
}

export type SeenMarkup = (markup: Markup) => void;

let seen: SeenMarkup | undefined;
let last: Markup | undefined;

/** Reports `markup` to the current render's listener, if any. */
export function report(markup: Markup): void {
  if (seen !== undefined && markup !== last) {
    last = markup;
    seen(markup);
  }
}

/** Sets the listener for one render; returns the previous one, to restore afterwards. */
export function listenFor(fn: SeenMarkup | undefined): SeenMarkup | undefined {
  const outer = seen;
  seen = fn;
  last = undefined;
  return outer;
}

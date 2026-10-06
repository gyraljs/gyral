// `raw(html)` (view/02-bindings.md "`raw(html)`"): trusted markup parsed in a child hole, kept
// as a node range after a start anchor and re-parsed only when the string changes. Its result
// carries `commitRaw`, so apps that never call `raw` don't bundle this module.
import { DEV } from '#view-dev';
import { EMPTY, RAW, type ChildPart } from './child-part.js';
import { removeRange } from './nodes.js';
import { report } from './seen.js';
import { MARKUP, type RawResult } from './values.js';
import { warnRaw } from './warn.js';

/** Parsed `raw()` markup: the start anchor, the last node, and the string. */
export class RawRange {
  constructor(
    readonly start: Comment,
    public end: Node,
    public html: string,
  ) {}

  first(): Node {
    return this.start;
  }

  last(): Node {
    return this.end;
  }

  remove(): void {
    removeRange(this.start, this.end);
  }
}

let parser: HTMLTemplateElement | undefined;

/** `html` parsed by a <template> (its content is reused: read it before the next call). */
export function parse(html: string): DocumentFragment {
  parser ??= document.createElement('template');
  parser.innerHTML = html;
  return parser.content;
}

/** Commits `raw()` markup into `part`. */
function commitRaw(part: ChildPart, html: string): void {
  if (DEV) warnRaw();
  report({ html });
  if (part.kind === RAW) {
    const range = part.content as RawRange;
    if (range.html === html) return;
    if (range.end !== range.start) removeRange(range.start.nextSibling as Node, range.end);
    const frag = parse(html);
    range.end = frag.lastChild ?? range.start;
    range.html = html;
    range.start.after(frag);
    return;
  }
  if (part.kind !== EMPTY) part.clear();
  const start = document.createComment('');
  const frag = parse(html);
  const end = frag.lastChild ?? start;
  frag.prepend(start);
  part.parent().insertBefore(frag, part.end());
  part.kind = RAW;
  part.content = new RawRange(start, end, html);
}

/**
 * Trusted markup from your own code (Markdown output, JSON-LD), parsed in a child hole and
 * re-parsed only when the string changes. Never pass user input.
 */
export function raw(html: string): RawResult {
  return { [MARKUP]: commitRaw, html };
}

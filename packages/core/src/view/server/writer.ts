// The server renderer's walk (view/06-server.md "Writing a template result"): writes a child
// value by walking template objects' `segments` (01), never tokenizing or building a DOM. Each
// string segment is written verbatim; each hole op takes its value(s). Start tags and custom
// elements are tags.ts.
import { isList, nothing, rawHtml, type ListResult } from '../render/values.js';
import { badChild, badKey, warnTrue } from '../render/warn.js';
import { isTemplateResult, templateOf, type TemplateResult } from '../template.js';
import { escapeText, onlyWhitespace } from './escape.js';
import { Markup, PLAIN, type Frame, type Opening } from './tags.js';
import { checkPromise, fosterError, textContent, truthy } from './values.js';

export type { Deferred, Item } from './tags.js';

/** Parents in which the parser moves non-whitespace text out (foster parenting). */
const TABLE = new Set(['table', 'tbody', 'thead', 'tfoot', 'tr']);

const tableTag = (parent: string): string | undefined => (TABLE.has(parent) ? parent : undefined);

/** Warning key for values outside any template (the render root, a component's view). */
export const ROOT: object = {};

export class Writer extends Markup {
  /** Writing a page shell's holes (a `server` template): never hydrated, so no anchors (06). */
  private shell = false;

  /** A child value (02 "Child values"). `table`: the parent, when it is table structure. */
  child(v: unknown, table: string | undefined, at: object): void {
    switch (typeof v) {
      case 'string':
        if (v === '') return;
        if (table !== undefined && this.dev && !onlyWhitespace(v)) fosterError(v, table);
        this.buf += escapeText(v);
        return;
      case 'number':
        if (table !== undefined && this.dev) fosterError(String(v), table);
        this.buf += String(v);
        return;
      case 'object':
        if (v !== null) this.object(v, table, at);
        return;
      case 'boolean':
        if (v && this.dev) warnTrue(at);
        return;
      case 'undefined':
        return;
      default:
        if (v !== nothing && this.dev) badChild(v);
    }
  }

  private object(v: object, table: string | undefined, at: object): void {
    if (isTemplateResult(v)) {
      this.template(v, table);
      return;
    }
    if (isList(v)) {
      this.list(v, table, at);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v as readonly unknown[]) this.child(item, table, at);
      return;
    }
    const raw = rawHtml(v);
    if (raw !== undefined) {
      // The start anchor hydration finds (02 "raw(html)"); a page shell is never hydrated.
      this.buf += this.shell ? raw : `<!---->${raw}`;
      return;
    }
    checkPromise(v, 'a child hole');
    if (this.dev) badChild(v);
  }

  /** `each(…)`: rows one after another, no markers (03). Keys are checked in development. */
  private list(v: ListResult, table: string | undefined, at: object): void {
    const { items, key, row, pick } = v;
    const seen = this.dev ? new Set<unknown>() : undefined;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (seen !== undefined) {
        const k = key(item);
        const dup = seen.has(k);
        if (dup || (typeof k !== 'string' && typeof k !== 'number')) badKey(k, i, dup);
        seen.add(k);
      }
      this.child(row(item, pick === undefined ? undefined : pick(item)), table, at);
    }
  }

  /** One template instance: its segments with this render's values. */
  template(result: TemplateResult, table: string | undefined): void {
    const template = templateOf(result);
    const segments = template.segments;
    if (segments === undefined) {
      throw new Error(
        `gyral: template ${JSON.stringify(template.html.slice(0, 40))} has no server ` +
          'segments: it was compiled for the client. Render on the server with an SSR build ' +
          '(or the runtime normalizer), which keeps them ' +
          '(docs/design-docs/view/01-templates.md "Compiled").',
      );
    }
    // Development marker: hydration checks the id before each instance (07). Page shells are
    // never hydrated.
    if (this.dev && !template.server) this.buf += `<!--gyral:${template.id ?? ''}-->`;
    const values = result.values;
    const outer = this.shell;
    this.shell = template.server === true;
    let at = 0;
    let opening: Opening | undefined;
    let frames: Frame[] | undefined;
    for (const s of segments) {
      if (typeof s === 'string') {
        this.buf += s;
        continue;
      }
      switch (s.k) {
        case 'child':
          this.child(values[at++], s.in === undefined ? table : tableTag(s.in), s);
          break;
        case 'text':
          this.buf += escapeText(textContent(values[at++], s, this.dev));
          break;
        case 'attr':
          at = this.attr(s, values, at, opening);
          break;
        case 'bool':
          // `?indeterminate` has no attribute: it is the property only (02 "Live form state").
          if (truthy(values[at]) && s.name !== 'indeterminate') this.bare(s.name, opening);
          at++;
          break;
        case 'prop':
          if (opening !== undefined) opening.properties[s.name] = values[at];
          at++;
          break;
        case 'hook':
          this.hook(values[at++], opening);
          break;
        case 'open':
          opening = this.open(s.tag, s.html, s.attrs);
          break;
        case 'openEnd':
          (frames ??= []).push(this.openEnd(opening));
          opening = undefined;
          break;
        case 'close':
          this.close(frames?.pop() ?? PLAIN, s.tag);
      }
    }
    this.shell = outer;
  }
}

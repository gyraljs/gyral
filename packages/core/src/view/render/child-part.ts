// The child part (view/02-bindings.md "Child values", "The anchor rule"): one class for every
// child hole, list row, array item and render root, so its call sites stay monomorphic. It
// inserts before its reference node: a static node of the template (`ref`), the end of its
// parent element (`ref` null), or, for root-level holes, rows and items, wherever its owner
// says (the instance's or list's position, resolved only when something is inserted).
import { DEV } from '#view-dev';
import { isTemplateResult, sourceOf, templateOf, type TemplateResult } from '../template.js';
import { Instance } from './instance.js';
import { clearList, commitItems, type List } from './list.js';
import { EACH, isList, isRaw, MARKUP, nothing } from './values.js';
import type { RawRange } from './raw.js';
import { badChild, warnTrue } from './warn.js';

/** What a child part holds. */
export const EMPTY = 0;
export const TEXT = 1;
export const INSTANCE = 2;
export const ITEMS = 3;
export const LIST = 4;
export const RAW = 5;

/** Resolves the position of the parts it owns (root-level open parts, rows, items). */
export interface Owner {
  parentFor(index: number): Node;
  endFor(index: number): Node | null;
}

/** What a child part's content can be, besides text. */
type Span = Instance | List | RawRange;

export class ChildPart {
  /** The parent element, when fixed (holes inside an element, the render root). */
  parentNode: Node | null;
  /** The static reference node; null: the end of `parentNode`. Unused when `owner` is set. */
  ref: Node | null;
  /** Set for open parts: their position comes from the owner. */
  owner: Owner | null;
  /** Position among the owner's rows or items. */
  index: number;
  /** Index of the value in the instance's values. */
  readonly at: number;
  /** The part is its parent element's only content (lists clear with replaceChildren). */
  readonly sole: boolean;
  kind: number;
  /** Committed text value (TEXT). */
  value: unknown;
  content: Text | Instance | List | RawRange | null;
  /** Rows of `each` (view/03-lists.md): key, item and pick result last rendered. */
  key: unknown;
  item: unknown;
  picked: unknown;

  constructor(
    parentNode: Node | null,
    ref: Node | null,
    owner: Owner | null,
    index: number,
    sole: boolean,
    at: number,
  ) {
    this.parentNode = parentNode;
    this.ref = ref;
    this.owner = owner;
    this.index = index;
    this.at = at;
    this.sole = sole;
    this.kind = EMPTY;
    this.value = undefined;
    this.content = null;
    this.key = undefined;
    this.item = undefined;
    this.picked = undefined;
  }

  set(values: readonly unknown[]): void {
    this.commit(values[this.at]);
  }

  /** The node new content goes into. */
  parent(): Node {
    if (this.parentNode !== null) return this.parentNode;
    if (this.owner !== null) return this.owner.parentFor(this.index);
    return (this.ref as Node).parentNode as Node;
  }

  /** The node after this part's content (null: the end of the parent). */
  end(): Node | null {
    return this.owner === null ? this.ref : this.owner.endFor(this.index);
  }

  first(): Node | null {
    const content = this.content;
    return this.kind === TEXT ? (content as Text) : content && (content as Span).first();
  }

  last(): Node | null {
    const content = this.content;
    return this.kind === TEXT ? (content as Text) : content && (content as Span).last();
  }

  commit(value: unknown): void {
    switch (typeof value) {
      case 'string':
      case 'number':
        this.text(value);
        return;
      case 'object':
        if (value === null) break;
        if (isTemplateResult(value)) {
          this.template(value);
          return;
        }
        if (isList(value)) {
          value[EACH](this, value);
          return;
        }
        if (Array.isArray(value)) {
          commitItems(this, value);
          return;
        }
        if (isRaw(value)) {
          value[MARKUP](this, value.html);
          return;
        }
        if (DEV) badChild(value);
        break;
      case 'boolean':
        if (DEV && value) warnTrue(this);
        break;
      case 'undefined':
        break;
      default:
        if (DEV && value !== nothing) badChild(value);
    }
    if (this.kind !== EMPTY) this.clear();
  }

  private text(value: string | number): void {
    if (this.kind === TEXT) {
      if (value !== this.value) {
        this.value = value;
        (this.content as Text).data = typeof value === 'string' ? value : String(value);
      }
      return;
    }
    if (this.kind !== EMPTY) this.clear();
    const data = typeof value === 'string' ? value : String(value);
    const parent = this.parentNode;
    let node: Text;
    if (this.sole && parent !== null && data !== '') {
      // The parent's only content: one DOM call creates and inserts the Text node.
      parent.textContent = data;
      node = parent.firstChild as Text;
    } else {
      node = document.createTextNode(data);
      this.parent().insertBefore(node, this.end());
    }
    this.kind = TEXT;
    this.content = node;
    this.value = value;
  }

  private template(result: TemplateResult): void {
    const source = sourceOf(result);
    if (this.kind === INSTANCE) {
      const instance = this.content as Instance;
      if (instance.source === source) {
        instance.update(result.values);
        return;
      }
      // Another source with the same id (a second call site, a module reloaded in development)
      // is the same template. Production client objects have no id: each is its own template,
      // so a different object replaces the instance (01 "Template ids").
      const template = templateOf(result);
      if (template.id !== undefined && template.id === instance.template.id) {
        instance.source = source;
        instance.update(result.values);
        return;
      }
      this.clear();
      this.create(result, source);
      return;
    }
    if (this.kind !== EMPTY) this.clear();
    this.create(result, source);
  }

  private create(result: TemplateResult, source: unknown): void {
    const instance = new Instance(templateOf(result), source, this);
    instance.update(result.values);
    instance.insert(this.parent(), this.end());
    this.kind = INSTANCE;
    this.content = instance;
  }

  /** Removes the content; the part becomes empty. */
  clear(): void {
    const content = this.content;
    if (this.kind === TEXT) (content as Text).remove();
    else if (this.kind === ITEMS || this.kind === LIST) clearList(this, content as List);
    else if (content !== null) (content as Instance | RawRange).remove();
    this.kind = EMPTY;
    this.content = null;
    this.value = undefined;
  }
}

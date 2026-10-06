// Template instances (view/01-templates.md "Instantiation", view/02-bindings.md "Commit order").
// An instance is cloned with `document.importNode` (nested custom elements upgrade at once),
// every part's nodes are resolved from the clone first by child-index paths (firstChild/
// nextSibling, sharing prefixes; no TreeWalker, no marker search), then the values commit while
// the clone is still detached, and only then is it inserted, so child components connect with
// their props set. A template with one root node and no root-level holes clones just that node.
// How to reach the nodes, and what each part is, comes from the template's plan (plan.ts).
// Hydration (adopt.ts) creates instances with `adopt` set and fills them from server DOM.
import type { PartSpec, TemplateObject } from '../normalize/types.js';
import { AttrPart, type Part } from './attr-parts.js';
import { ChildPart, type Owner } from './child-part.js';
import { removeRange } from './nodes.js';
import { CHILD, nodes, planOf, ROOT, stack, walk, type Plan } from './plan.js';

/** The DOM cloned from one template, plus its parts. */
export class Instance implements Owner {
  readonly template: TemplateObject;
  /** The result source last rendered (strings array or compiled object), for a fast compare. */
  source: unknown;
  /** The child part whose content this instance is. */
  readonly holder: ChildPart;
  readonly parts: Part[];
  /** First and last static root nodes; null when the template is a single hole. */
  start: Node | null;
  end: Node | null;
  /** Root-level child parts before the first / after the last static root node. */
  head: ChildPart | null;
  tail: ChildPart | null;
  /** The clone, until it is inserted. */
  frag: DocumentFragment | null;

  /** `adopt`: hydration (adopt.ts) fills the parts and root nodes from server DOM instead. */
  constructor(template: TemplateObject, source: unknown, holder: ChildPart, adopt?: boolean) {
    this.template = template;
    this.source = source;
    this.holder = holder;
    this.parts = [];
    this.head = null;
    this.tail = null;
    this.frag = this.start = this.end = null;
    if (adopt === true) return;
    const plan = planOf(template);
    if (plan.single) {
      const root = document.importNode(plan.content.firstChild as Node, true);
      stack[1] = root;
      this.start = this.end = root;
    } else {
      const frag = document.importNode(plan.content, true);
      stack[0] = frag;
      this.frag = frag;
      this.start = frag.firstChild;
      this.end = frag.lastChild;
    }
    walk(plan);
    this.build(plan);
  }

  private build(plan: Plan): void {
    const { a, b, at, kinds } = plan;
    const specs = this.template.parts;
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i] as number;
      const node = nodes[a[i] as number] as Element;
      if (kind >= 0) {
        const spec = specs[i] as PartSpec & { name?: string; strings?: readonly string[] };
        this.parts.push(new AttrPart(node, kind, spec.name ?? '', at[i] as number, spec.strings));
        continue;
      }
      const r = b[i] as number;
      const ref = r >= 0 ? (nodes[r] as Node) : null;
      if (kind !== ROOT) {
        this.parts.push(new ChildPart(node, ref, null, 0, kind !== CHILD, at[i] as number));
        continue;
      }
      const part = new ChildPart(null, ref, ref === null ? this : null, 0, false, at[i] as number);
      if (ref === null) this.tail = part;
      else if (ref === this.start) this.head = part;
      this.parts.push(part);
    }
  }

  /** Commits this render's values, part by part in document order. */
  update(values: readonly unknown[]): void {
    const parts = this.parts;
    for (let i = 0; i < parts.length; i++) (parts[i] as Part).set(values);
  }

  /** Inserts the (committed) clone; afterwards root-level parts resolve through the holder. */
  insert(parent: Node, before: Node | null): void {
    parent.insertBefore(this.frag ?? (this.start as Node), before);
    this.frag = null;
  }

  first(): Node | null {
    const head = this.head !== null ? this.head.first() : null;
    if (head !== null) return head;
    if (this.start !== null) return this.start;
    return this.tail !== null ? this.tail.first() : null;
  }

  last(): Node | null {
    const tail = this.tail !== null ? this.tail.last() : null;
    if (tail !== null) return tail;
    if (this.end !== null) return this.end;
    return this.head !== null ? this.head.last() : null;
  }

  remove(): void {
    const first = this.first();
    if (first === null) return;
    const last = this.last() as Node;
    if (first === last) (first as ChildNode).remove();
    else removeRange(first, last);
  }

  /** Owner of root-level open parts: the clone while building, then the holder's parent. */
  parentFor(): Node {
    if (this.frag !== null) return this.frag;
    return this.start !== null ? (this.start.parentNode as Node) : this.holder.parent();
  }

  endFor(): Node | null {
    return this.frag !== null ? null : this.holder.end();
  }
}

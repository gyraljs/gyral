// Emits the template object's markup from the normalizer's tree (view/01-templates.md steps 3
// and 4): the client HTML (bound attributes removed, anchors added by view/02-bindings.md's
// anchor rule), the server segments (types.ts), the part table with child-index paths, and the
// shape of the DOM the browser must build (checked by prepare.ts).
import type { ElementNode, TreeNode } from './tree.js';
import {
  ATTR_PART,
  BOOL_PART,
  CHILD_BEFORE,
  CHILD_END,
  CHILD_SOLE,
  HOOK_PART,
  MULTI_PART,
  PROP_PART,
  TEXT_PART,
  type PartSpec,
  type Path,
  type Segment,
  type Shape,
  type ShapeNode,
} from './types.js';

const ANCHOR = '<!---->';

export interface Emitted {
  readonly html: string;
  readonly parts: PartSpec[];
  readonly segments: Segment[];
  readonly shape: Shape;
}

class Emitter {
  /** A page shell (`server`): never hydrated, so it needs no anchors (06). */
  constructor(private readonly server: boolean) {}

  html = '';
  readonly parts: PartSpec[] = [];
  readonly segments: Segment[] = [];

  /** Static markup: appended to the HTML and to the last string segment. */
  out(text: string): void {
    if (text === '') return;
    this.html += text;
    const last = this.segments.length - 1;
    const prev = this.segments[last];
    if (typeof prev === 'string') this.segments[last] = prev + text;
    else this.segments.push(text);
  }

  op(segment: Segment): void {
    this.segments.push(segment);
  }

  /** `parent`: the parent element's name; undefined at the template root. */
  children(nodes: readonly TreeNode[], path: Path, parent?: string): Shape {
    const shape: ShapeNode[] = [];
    nodes.forEach((node, k) => {
      switch (node.type) {
        case 'text':
          this.out(node.raw);
          shape.push('#text');
          return;
        case 'comment':
          this.out(node.raw);
          shape.push('#comment');
          return;
        case 'doctype':
          // Server templates only; the browser drops a doctype inside a fragment.
          this.out(node.raw);
          return;
        case 'el':
          shape.push(this.element(node, [...path, shape.length]));
          return;
        case 'hole':
          if (node.kind === 'text') {
            this.parts.push([TEXT_PART, path]);
            this.op({ k: 'text' });
            return;
          }
          this.child(nodes, k, path, shape, parent);
      }
    });
    return shape;
  }

  /** A child hole: inserts before the next static element or comment, the end, or an anchor. */
  private child(
    nodes: readonly TreeNode[],
    k: number,
    path: Path,
    shape: ShapeNode[],
    parent: string | undefined,
  ): void {
    const next = nodes[k + 1];
    this.op(parent === undefined ? { k: 'child' } : { k: 'child', in: parent });
    if (next === undefined) {
      this.parts.push([nodes.length === 1 ? CHILD_SOLE : CHILD_END, path]);
      return;
    }
    this.parts.push([CHILD_BEFORE, path, shape.length]);
    if (next.type === 'el' || next.type === 'comment' || this.server) return;
    this.out(ANCHOR);
    shape.push('#comment');
  }

  private element(el: ElementNode, path: Path): ShapeNode {
    let open = `<${el.raw}`;
    for (const a of el.attrs) {
      if (a.kind === 'static') open += a.value === null ? ` ${a.name}` : ` ${a.name}=${a.value}`;
    }
    if (el.props !== undefined) {
      this.html += open;
      this.op({ k: 'open', tag: el.name, html: open, attrs: el.props });
    } else this.out(open);
    for (const a of el.attrs) {
      if (a.kind === 'static') continue;
      if (a.kind === 'hook') {
        this.parts.push([HOOK_PART, path]);
        this.op({ k: 'hook' });
      } else if (a.kind === 'attr' && a.strings !== undefined) {
        this.parts.push([MULTI_PART, path, a.name, a.strings]);
        this.op({ k: 'attr', name: a.name, strings: a.strings });
      } else {
        const kind = a.kind === 'attr' ? ATTR_PART : a.kind === 'bool' ? BOOL_PART : PROP_PART;
        this.parts.push([kind, path, a.name]);
        this.op({ k: a.kind, name: a.name });
      }
    }
    const end = el.empty && el.ns !== 'html' ? '/>' : '>';
    if (el.props !== undefined) {
      this.html += end;
      this.op({ k: 'openEnd' });
    } else this.out(end);
    if (el.empty) return [el.name, []];
    // The parser drops a newline right after <pre>, <listing> and <textarea>: give it one to
    // drop, so a hole or text starting with a newline keeps its own.
    const first = el.children[0];
    const newline = el.ns === 'html' && /^(pre|listing|textarea)$/.test(el.name);
    if (
      newline &&
      (first?.type === 'hole' || (first?.type === 'text' && first.raw.startsWith('\n')))
    ) {
      this.out('\n');
    }
    const shape = this.children(el.children, path, el.name);
    if (el.props !== undefined) {
      this.html += `</${el.raw}>`;
      this.op({ k: 'close', tag: el.name });
    } else this.out(`</${el.raw}>`);
    return [el.name, shape];
  }
}

/**
 * Emits the HTML, part table, segments and shape for a template's tree. A `server` template
 * (a page shell) gets no anchors: hydration never walks it, and the browser never renders it.
 */
export function emit(root: readonly TreeNode[], server: boolean): Emitted {
  const e = new Emitter(server);
  const shape = e.children(root, []);
  return { html: e.html, parts: e.parts, segments: e.segments, shape };
}

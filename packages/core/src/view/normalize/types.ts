// The template object (view/01-templates.md "The template object") and its part table
// (view/02-bindings.md "Hole kinds"). Plain JSON data, no functions: the Vite compiler (Phase 6)
// emits it as code, the browser instantiates from it, and the server writes from it.

/** Child-index path from the template's content root (`[]` is the root itself). */
export type Path = readonly number[];

/** One entry per binding, in source order. Multi-attributes take several values. */
export type PartSpec =
  /**
   * A child hole. `path` leads to the parent element (`[]`: the template root). `ref` is the
   * index, among the parent's child nodes in the template DOM, of the node the part inserts
   * before: the next static element or comment, or the anchor comment the normalizer emitted.
   * `null` means the end of the parent. `sole`: the hole is the parent's only child node.
   */
  | {
      readonly k: 'child';
      readonly path: Path;
      readonly ref: number | null;
      readonly sole: boolean;
    }
  /**
   * An attribute. With `strings` it is a multi-attribute: `strings.length - 1` values joined
   * with these static pieces (character references already decoded).
   */
  | {
      readonly k: 'attr';
      readonly path: Path;
      readonly name: string;
      readonly strings?: readonly string[];
    }
  | { readonly k: 'bool'; readonly path: Path; readonly name: string }
  | { readonly k: 'prop'; readonly path: Path; readonly name: string }
  | { readonly k: 'hook'; readonly path: Path }
  /** The whole content of a `<textarea>` or `<title>`; `path` leads to that element. */
  | { readonly k: 'text'; readonly path: Path };

/**
 * What the server renderer writes (view/06-server.md), in order, with no tokenizing. Strings
 * are static markup, written verbatim. Each hole op takes the next value(s); the custom-element
 * ops take none and mark where a component's start tag ends and its end tag begins.
 *
 * - `child`: the value per 02's child table. Anchors are already in the next static string.
 *   `in` is the parent element's local name (absent at the template root, where the parent is
 *   wherever the instance is written): the development check for text the parser would move
 *   out of table structure needs it.
 * - `text`: the value as escaped text (`<textarea>`, `<title>` content).
 * - `attr`: ` name="escaped"`, or nothing for null/undefined/nothing. With `strings`, the
 *   pieces and `strings.length - 1` values are joined first (`nothing` in any piece: nothing).
 * - `bool`: ` name` when the value is truthy.
 * - `prop`: nothing in markup; a prop when the element is a Gyral component.
 * - `hook`: the hook's `server(args)` attributes.
 * - `open`: a custom element's start tag begins. `html` is `<tag` plus its static attributes,
 *   written verbatim; `attrs` are the same static attributes, decoded (props for a component).
 *   The element's attribute ops follow.
 * - `openEnd`: write `>`. A component writes its seed attribute first, and its shadow root
 *   after.
 * - `close`: write `</tag>`. Everything between `openEnd` and `close` is the element's children.
 *
 * Joining the strings with every op written empty (`open` as `html`, `openEnd` as `>`, `close`
 * as `</tag>`) gives exactly the template's `html`.
 */
export type Segment =
  | string
  | { readonly k: 'child'; readonly in?: string }
  | { readonly k: 'text' }
  | { readonly k: 'attr'; readonly name: string; readonly strings?: readonly string[] }
  | { readonly k: 'bool'; readonly name: string }
  | { readonly k: 'prop'; readonly name: string }
  | { readonly k: 'hook' }
  | {
      readonly k: 'open';
      readonly tag: string;
      readonly html: string;
      readonly attrs: readonly (readonly [name: string, value: string])[];
    }
  | { readonly k: 'openEnd' }
  | { readonly k: 'close'; readonly tag: string };

export interface TemplateObject {
  /** Deterministic id of the normalized strings (id.ts). */
  readonly id: string;
  /** Normalized template HTML for the client: bound attributes removed, anchors added. */
  readonly html: string;
  readonly parts: readonly PartSpec[];
  /** Contains document-level tags (<!doctype>, <html>, <head>, <body>): server-only. */
  readonly server: boolean;
  /**
   * Server writing plan. Absent from client-compiled template objects (the compiler drops it),
   * so the client renderer never reads it; the runtime preparer and server builds keep it.
   */
  readonly segments?: readonly Segment[];
  /** Development only: file:line:column of the call site. */
  readonly loc?: string;
}

/**
 * The DOM the browser must build from `html`, for the runtime preparer's check (prepare.ts):
 * `'#text'`, `'#comment'`, or `[localName (lower case), children]`.
 */
export type ShapeNode = '#text' | '#comment' | readonly [name: string, children: Shape];
export type Shape = readonly ShapeNode[];

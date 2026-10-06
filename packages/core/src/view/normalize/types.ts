// The template object (view/01-templates.md "The template object") and its part table
// (view/02-bindings.md "Hole kinds"). Plain JSON data, no functions: the Vite compiler (Phase 6)
// emits it as code, the browser instantiates from it, and the server writes from it. Compact
// on purpose (numeric part kinds, tuples, `server` only when true), so the code compiled
// client builds carry stays small with nothing to decode.

/** Child-index path from the template's content root (`[]` is the root itself). */
export type Path = readonly number[];

// Part kinds: the first entry of a PartSpec tuple. Small numbers, because compiled client
// builds carry every template's part table as code (view/01-templates.md "Compiled").
/** `[CHILD_END, path]`: a child hole that inserts at the end of its parent. */
export const CHILD_END = 0;
/** `[CHILD_SOLE, path]`: a child hole that is its parent's only child node (so at its end). */
export const CHILD_SOLE = 1;
/** `[CHILD_BEFORE, path, ref]`: a child hole that inserts before the parent's child `ref`. */
export const CHILD_BEFORE = 2;
/** `[ATTR_PART, path, name]`: `name=${v}`. */
export const ATTR_PART = 3;
/** `[MULTI_PART, path, name, strings]`: `name="a ${x} b"`. */
export const MULTI_PART = 4;
/** `[BOOL_PART, path, name]`: `?name=${v}`. */
export const BOOL_PART = 5;
/** `[PROP_PART, path, name]`: `.name=${v}`. */
export const PROP_PART = 6;
/** `[HOOK_PART, path]`: `${hook(…)}` in a start tag. */
export const HOOK_PART = 7;
/** `[TEXT_PART, path]`: the whole content of a `<textarea>` or `<title>`. */
export const TEXT_PART = 8;

/**
 * One entry per binding, in source order: a tuple whose first entry is its kind (above), whose
 * second is a path, then the kind's own fields. Multi-attributes take several values.
 *
 * - Child holes: `path` leads to the parent element (`[]`: the template root). `ref` is the
 *   index, among the parent's child nodes in the template DOM, of the node the part inserts
 *   before: the next static element or comment, or the anchor comment the normalizer emitted.
 *   Without `ref` the hole inserts at the end of the parent (CHILD_END, CHILD_SOLE).
 * - Attributes, booleans, properties: `path` leads to the element; `name` is the attribute or
 *   property name. A multi-attribute's `strings` are its static pieces (character references
 *   already decoded): `strings.length - 1` values are joined with them.
 * - Hooks: `path` leads to the element. Text: `path` leads to the `<textarea>`/`<title>`.
 */
export type PartSpec =
  | readonly [
      kind: typeof CHILD_END | typeof CHILD_SOLE | typeof HOOK_PART | typeof TEXT_PART,
      path: Path,
    ]
  | readonly [kind: typeof CHILD_BEFORE, path: Path, ref: number]
  | readonly [
      kind: typeof ATTR_PART | typeof BOOL_PART | typeof PROP_PART,
      path: Path,
      name: string,
    ]
  | readonly [kind: typeof MULTI_PART, path: Path, name: string, strings: readonly string[]];

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
  /**
   * `true` when it contains document-level tags (<!doctype>, <html>, <head>, <body>):
   * server-only. Absent otherwise.
   */
  readonly server?: true;
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

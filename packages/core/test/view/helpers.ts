// Test helpers for the view-layer specs: template strings without a renderer, and rendering a
// template object's segments with every value empty.
import {
  BOOL_PART,
  CHILD_BEFORE,
  CHILD_END,
  CHILD_SOLE,
  HOOK_PART,
  MULTI_PART,
  PROP_PART,
  TEXT_PART,
  type PartSpec,
  type Segment,
  type TemplateObject,
} from '../../src/view/normalize/types.js';

/** The static strings of a tagged template literal. */
export const t = (strings: TemplateStringsArray, ...values: unknown[]): readonly string[] =>
  values.length >= 0 ? [...strings] : [];

/** Joins the segments with every value written empty (what the server writes for `nothing`). */
export function emptyRender(segments: readonly Segment[]): string {
  return segments
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s.k === 'open') return s.html;
      if (s.k === 'openEnd') return '>';
      if (s.k === 'close') return `</${s.tag}>`;
      return '';
    })
    .join('');
}

/** A part table entry (a compact tuple, 01) as a readable object, for assertions. */
export type ReadablePart =
  | { k: 'child'; path: readonly number[]; ref: number | null; sole: boolean }
  | { k: 'attr'; path: readonly number[]; name: string; strings?: readonly string[] }
  | { k: 'bool' | 'prop'; path: readonly number[]; name: string }
  | { k: 'hook' | 'text'; path: readonly number[] };

export function readable(p: PartSpec): ReadablePart {
  const path = p[1];
  switch (p[0]) {
    case CHILD_END:
    case CHILD_SOLE:
      return { k: 'child', path, ref: null, sole: p[0] === CHILD_SOLE };
    case CHILD_BEFORE:
      return { k: 'child', path, ref: p[2], sole: false };
    case MULTI_PART:
      return { k: 'attr', path, name: p[2], strings: p[3] };
    case HOOK_PART:
    case TEXT_PART:
      return { k: p[0] === HOOK_PART ? 'hook' : 'text', path };
    default:
      return {
        k: p[0] === BOOL_PART ? 'bool' : p[0] === PROP_PART ? 'prop' : 'attr',
        path,
        name: p[2],
      };
  }
}

/** The template object a client build carries: no segments, no loc (compile.ts). */
export function clientObject(template: TemplateObject): TemplateObject {
  const { id, html, parts, server } = template;
  return server === true ? { id, html, parts, server } : { id, html, parts };
}

/** How many values a template consumes, counted from its parts and from its segments. */
export function valueCounts(template: TemplateObject): { parts: number; segments: number } {
  const take = (x: object): number =>
    'strings' in x && Array.isArray(x.strings) ? x.strings.length - 1 : 1;
  const holes = new Set(['child', 'text', 'attr', 'bool', 'prop', 'hook']);
  return {
    parts: template.parts.reduce((n, p) => n + take(readable(p)), 0),
    segments: (template.segments ?? []).reduce(
      (n, s) => (typeof s !== 'string' && holes.has(s.k) ? n + take(s) : n),
      0,
    ),
  };
}

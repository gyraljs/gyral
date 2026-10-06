// Test helpers for the view-layer specs: template strings without a renderer, and rendering a
// template object's segments with every value empty.
import type { Segment, TemplateObject } from '../../src/view/normalize/types.js';

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

/** How many values a template consumes, counted from its parts and from its segments. */
export function valueCounts(template: TemplateObject): { parts: number; segments: number } {
  const take = (x: { k: string; strings?: readonly string[] }): number =>
    x.strings !== undefined ? x.strings.length - 1 : 1;
  const holes = new Set(['child', 'text', 'attr', 'bool', 'prop', 'hook']);
  return {
    parts: template.parts.reduce((n, p) => n + take(p), 0),
    segments: template.segments.reduce(
      (n, s) => (typeof s !== 'string' && holes.has(s.k) ? n + take(s) : n),
      0,
    ),
  };
}

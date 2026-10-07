// The normalizer (view/01-templates.md "Normalization"): one pure function from a call site's
// static strings to its template object, shared by the Vite compiler, the browser's runtime
// preparer and the server renderer. Steps: minify whitespace (holes never move), tokenize and
// build the tree (rules of view/09-template-rules.md), emit HTML, segments and parts, and hash
// the normalized strings into the id. No DOM: it runs in Node and in the browser. An svg
// template (01 "svg templates") is built as SVG content from its top level, and is flagged.
import { emit } from './emit.js';
import { templateId } from './id.js';
import { Source } from './source.js';
import { tokenize } from './tokenizer.js';
import { TreeBuilder } from './tree.js';
import type { NormalizedTemplate, Shape } from './types.js';
import { minifyStrings } from './whitespace.js';

export interface Analysis {
  readonly template: NormalizedTemplate;
  /** The whitespace-normalized strings the id was computed from. */
  readonly strings: readonly string[];
  /** The DOM the browser must build from `template.html` (checked by the runtime preparer). */
  readonly shape: Shape;
}

/**
 * The template object plus what the runtime preparer checks it against. `svg`: the strings are
 * an svg template's (`` svg`…` ``), whose top level is SVG content.
 */
export function analyze(strings: readonly string[], loc?: string, svg = false): Analysis {
  const normalized = minifyStrings(strings);
  const src = new Source(normalized, loc);
  const tree = new TreeBuilder(src, svg);
  tokenize(src, tree);
  const { html, parts, segments, shape } = emit(tree.root, tree.server);
  const template: NormalizedTemplate = {
    id: templateId(normalized, svg),
    html,
    parts,
    ...(tree.server ? { server: true as const } : {}),
    ...(svg ? { svg: true as const } : {}),
    segments,
    ...(loc === undefined ? {} : { loc }),
  };
  return { template, strings: normalized, shape };
}

/**
 * Normalizes a template's static strings into its template object (JSON data). Throws a
 * TemplateError for markup that breaks a template rule. `svg`: an svg template's strings.
 */
export function normalize(
  strings: readonly string[],
  loc?: string,
  svg = false,
): NormalizedTemplate {
  return analyze(strings, loc, svg).template;
}

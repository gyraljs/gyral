// The normalizer (view/01-templates.md "Normalization"): one pure function from a call site's
// static strings to its template object, shared by the Vite compiler, the browser's runtime
// preparer and the server renderer. Steps: minify whitespace (holes never move), tokenize and
// build the tree (rules of view/09-template-rules.md), emit HTML, segments and parts, and hash
// the normalized strings into the id. No DOM: it runs in Node and in the browser.
import { emit } from './emit.js';
import { templateId } from './id.js';
import { Source } from './source.js';
import { tokenize } from './tokenizer.js';
import { TreeBuilder } from './tree.js';
import type { Shape, TemplateObject } from './types.js';
import { minifyStrings } from './whitespace.js';

export interface Analysis {
  readonly template: TemplateObject;
  /** The whitespace-normalized strings the id was computed from. */
  readonly strings: readonly string[];
  /** The DOM the browser must build from `template.html` (checked by the runtime preparer). */
  readonly shape: Shape;
}

/** The template object plus what the runtime preparer checks it against. */
export function analyze(strings: readonly string[], loc?: string): Analysis {
  const normalized = minifyStrings(strings);
  const src = new Source(normalized, loc);
  const tree = new TreeBuilder(src);
  tokenize(src, tree);
  const { html, parts, segments, shape } = emit(tree.root, tree.server);
  const template: TemplateObject = {
    id: templateId(normalized),
    html,
    parts,
    server: tree.server,
    segments,
    ...(loc === undefined ? {} : { loc }),
  };
  return { template, strings: normalized, shape };
}

/**
 * Normalizes a template's static strings into its template object (JSON data). Throws a
 * TemplateError for markup that breaks a template rule.
 */
export function normalize(strings: readonly string[], loc?: string): TemplateObject {
  return analyze(strings, loc).template;
}

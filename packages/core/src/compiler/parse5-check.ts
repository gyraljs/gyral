// Rule 7 at build time with parse5 (view/09-template-rules.md "How rule 7 is checked"): a
// spec-compliant HTML parser parses each template's HTML as <template> content, exactly like
// the runtime path's `<template>.innerHTML`, and its tree is compared with the shape the
// normalizer computed paths for (view/normalize/shape.ts, shared with the browser check). An
// svg template is parsed inside an <svg>, as the browser path does (template-element.ts).
//
// parse5 is an optional peer dependency of @gyral/core, loaded at build time by the compiler
// only: it never reaches browser or server bundles. Without it the build still runs
// the normalizer's structural rule 7 check and skips this one.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  repairError,
  shapeMismatch,
  type Shape,
  type ShapeNode,
  type TemplateObject,
} from '../view/index.js';

/** The slice of parse5's API the check uses (default tree adapter). */
export interface Parse5 {
  parseFragment(html: string): Parse5Node;
}

interface Parse5Node {
  readonly nodeName: string;
  readonly tagName?: string;
  readonly childNodes?: readonly Parse5Node[];
  readonly content?: Parse5Node;
}

const isParse5 = (value: unknown): value is Parse5 =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { parseFragment?: unknown }).parseFragment === 'function';

/**
 * Loads parse5 (`specifier`) as resolved from `@gyral/core`, else from the app's `root`;
 * undefined when neither has it. `require` (Node loads ES modules with it too) rather than
 * `import()`: when core runs from source, this module is loaded by a Vite module runner that
 * is closed by the time the build starts.
 */
export function loadParse5(specifier: string, root: string): Parse5 | undefined {
  for (const base of [import.meta.url, join(root, 'package.json')]) {
    try {
      const module: unknown = createRequire(base)(specifier);
      if (isParse5(module)) return module;
    } catch {
      // not resolvable from here
    }
  }
  return undefined;
}

function toShape(nodes: readonly Parse5Node[]): Shape {
  return nodes.map((node): ShapeNode => {
    if (node.nodeName === '#text') return '#text';
    if (node.nodeName === '#comment') return '#comment';
    const inner = node.tagName === 'template' ? node.content?.childNodes : node.childNodes;
    return [(node.tagName ?? node.nodeName).toLowerCase(), toShape(inner ?? [])];
  });
}

/** Rule 7's error when parse5 builds a different tree than `shape`; undefined if it agrees. */
export function checkWithParse5(
  parse5: Parse5,
  template: TemplateObject,
  shape: Shape,
): Error | undefined {
  // Page shells (document-level tags) are written by the server and never parsed as a
  // fragment; fragment parsing would drop their <html>/<head>/<body> tags.
  if (template.server) return undefined;
  let nodes = parse5.parseFragment(
    template.svg ? `<svg>${template.html}</svg>` : template.html,
  ).childNodes;
  // An svg template: the <svg>'s children, plus anything the parser moved out of it.
  if (template.svg && nodes !== undefined)
    nodes = [...(nodes[0]?.childNodes ?? []), ...nodes.slice(1)];
  const problem = shapeMismatch(shape, toShape(nodes ?? []));
  return problem === undefined
    ? undefined
    : repairError(template, 'The HTML parser (parse5)', problem);
}

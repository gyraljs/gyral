// The runtime template preparer (view/01-templates.md "Runtime"), resolved through core's
// `#prepare` import by default. It runs the normalizer once per call site (template.ts caches
// the result) and, when the browser first parses a template's HTML (template-element.ts),
// checks that the parse built exactly the DOM the normalizer's paths assume. A difference
// means the parser repaired the markup: rule 7 (view/09-template-rules.md). Builds made with
// the `gyral-compiled` condition get prepare-stub.ts instead.
import { recordTemplateId } from './normalize/id.js';
import { analyze } from './normalize/normalize.js';
import { repairError, shapeMismatch } from './normalize/shape.js';
import type { Shape, ShapeNode, TemplateObject } from './normalize/types.js';

const shapes = new WeakMap<TemplateObject, Shape>();
const prepared = new WeakMap<readonly string[], TemplateObject>();
// One-entry cache in front of the WeakMap: list rows ask for the same call site in a row.
let lastSource: readonly string[] | undefined;
let lastTemplate: TemplateObject | undefined;

/** The template object of a call site's strings, normalized (with development checks) once. */
export function prepare(strings: readonly string[]): TemplateObject {
  if (strings === lastSource) return lastTemplate as TemplateObject;
  let template = prepared.get(strings);
  if (template === undefined) {
    const analysis = analyze(strings);
    template = analysis.template;
    recordTemplateId(analysis.template.id, analysis.strings);
    shapes.set(template, analysis.shape);
    prepared.set(strings, template);
  }
  lastSource = strings;
  lastTemplate = template;
  return template;
}

/** The DOM the browser built, as a Shape (lower-case names, <template> content inlined). */
function domShape(nodes: NodeListOf<ChildNode>): Shape {
  return [...nodes].map((node): ShapeNode => {
    if (node.nodeType === 3) return '#text';
    if (node.nodeType === 8) return '#comment';
    if (node.nodeType !== 1) return [node.nodeName.toLowerCase(), []];
    const el = node as Element;
    const children =
      el.localName === 'template' ? (el as HTMLTemplateElement).content.childNodes : el.childNodes;
    return [el.localName.toLowerCase(), domShape(children)];
  });
}

/**
 * Throws rule 7 when the browser's parse of `template.html` (in `el`) differs from the tree
 * the normalizer computed paths for. Templates that didn't come from `prepare` are skipped.
 */
export function verify(template: TemplateObject, el: HTMLTemplateElement): void {
  const shape = shapes.get(template);
  if (shape === undefined) return;
  const problem = shapeMismatch(shape, domShape(el.content.childNodes));
  if (problem !== undefined) throw repairError(template, "The browser's HTML parser", problem);
}

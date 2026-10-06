// The runtime template preparer (view/01-templates.md "Runtime"), resolved through core's
// `#prepare` import by default. It runs the normalizer once per call site (template.ts caches
// the result) and, when the browser first parses a template's HTML (template-element.ts),
// checks that the parse built exactly the DOM the normalizer's paths assume. A difference
// means the parser repaired the markup: rule 7 (view/09-template-rules.md). Builds made with
// the `gyral-compiled` condition get prepare-stub.ts instead.
import { TemplateError } from './normalize/errors.js';
import { recordTemplateId } from './normalize/id.js';
import { analyze } from './normalize/normalize.js';
import type { Shape, ShapeNode, TemplateObject } from './normalize/types.js';

const shapes = new WeakMap<TemplateObject, Shape>();

/** Normalizes a call site's strings (development checks included). */
export function prepare(strings: readonly string[]): TemplateObject {
  const { template, strings: normalized, shape } = analyze(strings);
  recordTemplateId(template.id, normalized);
  shapes.set(template, shape);
  return template;
}

const describe = (node: ChildNode | undefined): string => {
  if (node === undefined) return 'nothing';
  if (node.nodeType === 1) return `<${(node as Element).localName}>`;
  return node.nodeType === 3 ? 'text' : node.nodeType === 8 ? 'a comment' : node.nodeName;
};

const expected = (node: ShapeNode | undefined): string =>
  node === undefined
    ? 'nothing'
    : typeof node === 'string'
      ? node === '#text'
        ? 'text'
        : 'a comment'
      : `<${node[0]}>`;

/** The first place where `nodes` differ from `shape`, as a message; undefined if none. */
function mismatch(
  shape: Shape,
  nodes: NodeListOf<ChildNode>,
  path: readonly number[],
): string | undefined {
  for (let k = 0; k < Math.max(shape.length, nodes.length); k++) {
    const want = shape[k];
    const got = nodes[k];
    const at = `[${[...path, k].join(', ')}]`;
    const same =
      want !== undefined &&
      got !== undefined &&
      (typeof want === 'string'
        ? (want === '#text' ? 3 : 8) === got.nodeType
        : got.nodeType === 1 && (got as Element).localName.toLowerCase() === want[0]);
    if (!same) return `at path ${at}: expected ${expected(want)}, found ${describe(got)}`;
    if (typeof want !== 'string') {
      const el = got as Element;
      const children =
        el.localName === 'template'
          ? (el as HTMLTemplateElement).content.childNodes
          : el.childNodes;
      const inner = mismatch(want[1], children, [...path, k]);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

/**
 * Throws rule 7 when the browser's parse of `template.html` (in `el`) differs from the tree
 * the normalizer computed paths for. Templates that didn't come from `prepare` are skipped.
 */
export function verify(template: TemplateObject, el: HTMLTemplateElement): void {
  const shape = shapes.get(template);
  if (shape === undefined) return;
  const problem = mismatch(shape, el.content.childNodes, []);
  if (problem === undefined) return;
  throw new TemplateError(
    7,
    `The browser's HTML parser built a different DOM for this template ${problem}. It ` +
      `repaired the markup (for example <tr> directly in <table>, a block element inside <p>, ` +
      `or <a> inside <a>), so part paths would point at the wrong nodes. Write the valid ` +
      `structure (<tbody>, closing </p> first, …).\n  template: ${template.html.slice(0, 120)}`,
    template.loc,
  );
}

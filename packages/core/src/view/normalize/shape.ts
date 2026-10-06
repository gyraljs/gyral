// Rule 7 by comparison (view/09-template-rules.md "How rule 7 is checked"): the DOM an HTML
// parser built from a template's HTML, as a Shape, against the shape the normalizer computed
// the part paths for. Any difference means the parser repaired the markup. The runtime
// preparer feeds it the browser's own parse (prepare.ts); the Vite template compiler feeds it
// parse5's (src/compiler/parse5-check.ts). No DOM here: it runs in Node and in the browser.
import { TemplateError } from './errors.js';
import type { Shape, ShapeNode, TemplateObject } from './types.js';

const describe = (node: ShapeNode | undefined): string =>
  node === undefined
    ? 'nothing'
    : typeof node === 'string'
      ? node === '#text'
        ? 'text'
        : 'a comment'
      : `<${node[0]}>`;

const same = (want: ShapeNode, got: ShapeNode): boolean =>
  typeof want === 'string' ? want === got : typeof got !== 'string' && want[0] === got[0];

/** The first place where `got` differs from `want`, as a message; undefined if none. */
export function shapeMismatch(
  want: Shape,
  got: Shape,
  path: readonly number[] = [],
): string | undefined {
  for (let k = 0; k < Math.max(want.length, got.length); k++) {
    const w = want[k];
    const g = got[k];
    if (w === undefined || g === undefined || !same(w, g)) {
      return `at path [${[...path, k].join(', ')}]: expected ${describe(w)}, found ${describe(g)}`;
    }
    if (typeof w !== 'string' && typeof g !== 'string') {
      const inner = shapeMismatch(w[1], g[1], [...path, k]);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

/** Rule 7's error for a parse that differs from the template's shape (`problem`). */
export function repairError(template: TemplateObject, parser: string, problem: string): Error {
  return new TemplateError(
    7,
    `${parser} built a different DOM for this template ${problem}. It repaired the markup ` +
      `(for example <tr> directly in <table>, a block element inside <p>, or <a> inside ` +
      `<a>), so part paths would point at the wrong nodes. Write the valid structure ` +
      `(<tbody>, closing </p> first, …).\n  template: ${template.html.slice(0, 120)}`,
    template.loc,
  );
}

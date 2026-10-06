// Hydration mismatches (view/07-hydration.md "Mismatches"): the server DOM differs from what
// the first client render needs. The message names the component, the template's call site
// (development builds know it), the path from the root to the node, and what was expected
// and found. Development throws it; production recovers the one component (core's caller).
import { DEV } from '#view-dev';

/** The server's DOM doesn't match the component's first client render. */
export class HydrationMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HydrationMismatch';
  }
}

/** A short description of a DOM node. */
function describe(node: Node): string {
  if (node.nodeType === 3) return `text ${JSON.stringify((node as Text).data.slice(0, 40))}`;
  if (node.nodeType === 8) return `<!--${(node as Comment).data}-->`;
  return node.nodeType === 1 ? `<${(node as Element).localName}>` : 'the root';
}

/** `div[0] › ul[2] › li[1]`: local names and child indexes from `root` down to `node`. */
function pathOf(node: Node, root: Node): string {
  const steps: string[] = [];
  for (let n: Node | null = node; n !== null && n !== root; n = n.parentNode) {
    let index = 0;
    for (let s = n.previousSibling; s !== null; s = s.previousSibling) index++;
    steps.unshift(`${n.nodeType === 1 ? (n as Element).localName : n.nodeName}[${String(index)}]`);
  }
  return steps.length === 0 ? 'the root' : steps.join(' › ');
}

/**
 * Throws a mismatch. `expected` describes what the walk needed; `found` is the DOM node there,
 * a description, or null when `at` (the parent) had no more children. `host` names the
 * component and `loc` the template's call site.
 */
export function mismatch(
  expected: string,
  found: Node | string | null,
  at: Node,
  root: Node,
  host: string,
  loc: string | undefined,
): never {
  const where = typeof found === 'object' && found !== null ? found : at;
  const what =
    found === null
      ? `the end of ${describe(at)}`
      : typeof found === 'string'
        ? found
        : describe(found);
  throw new HydrationMismatch(
    `gyral: hydration mismatch in ${host}${loc === undefined ? '' : ` (template at ${loc})`} ` +
      `at ${pathOf(where, root)}: expected ${expected}, found ${what}.` +
      (DEV
        ? " The server's HTML differs from the first client render: a view that isn't " +
          'deterministic (Date.now(), locale), a third party that changed the DOM before ' +
          'scripts ran, or a stale cached page (docs/design-docs/view/07-hydration.md ' +
          '"Mismatches").'
        : ''),
  );
}

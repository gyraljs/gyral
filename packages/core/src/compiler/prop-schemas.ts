// Property-only prop schemas out of production client builds (gyral-c5d.14, view/05-element.md
// "When props are validated"): `prop.value(check, opts)` declares a prop with no attribute, and
// production never checks property sets (or seeds), so its schema or type guard can't run
// there. Replacing a check that is a plain reference (`prop.value(Game)`, `schemas.game`) or an
// inline function (`prop.value((u): u is Game => …)`) with `void 0` lets the bundler drop it and
// whatever only it used, e.g. a schema module. Calls (`prop.value(v.array(Item))`) stay: their
// evaluation could have effects, and this pass never changes what runs. `prop.json` keeps its
// check (attributes are parsed through it in production). Development builds keep everything:
// they validate property sets.
import { children, nodeAt, nodesAt, scopeNames, type Node } from './ast.js';
import type { Edit } from './source.js';

/** Where `prop` comes from: the documented import only (`import { prop } from '@gyral/core'`). */
const CORE = '@gyral/core';

/** TypeScript wrappers around a runtime expression (`x as T`, `x satisfies T`, `x!`). */
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

/** Expressions whose evaluation has no effect: dropping them changes nothing that runs. */
function droppable(node: Node | undefined): boolean {
  if (node === undefined) return false;
  if (WRAPPERS.has(node.type)) return droppable(nodeAt(node, 'expression'));
  switch (node.type) {
    case 'Identifier':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;
    case 'MemberExpression': {
      // `schemas.game`: a chain of plain names (no computed keys, no calls, no optional links).
      const object = nodeAt(node, 'object');
      return (
        node['computed'] !== true &&
        node['optional'] !== true &&
        (object?.type === 'Identifier' ||
          (object?.type === 'MemberExpression' && droppable(object)))
      );
    }
    default:
      return false;
  }
}

/** The names `prop` is imported as: `{ local }` or, for `import * as ns`, `{ ns }`. */
function propImports(program: Node): { readonly locals: Set<string>; readonly ns: Set<string> } {
  const locals = new Set<string>();
  const ns = new Set<string>();
  for (const statement of nodesAt(program, 'body')) {
    if (statement.type !== 'ImportDeclaration' || statement['importKind'] === 'type') continue;
    if (nodeAt(statement, 'source')?.['value'] !== CORE) continue;
    for (const s of nodesAt(statement, 'specifiers')) {
      const local = nodeAt(s, 'local')?.['name'];
      if (typeof local !== 'string' || s['importKind'] === 'type') continue;
      if (s.type === 'ImportNamespaceSpecifier') ns.add(local);
      const imported = nodeAt(s, 'imported');
      if (s.type === 'ImportSpecifier' && (imported?.['name'] ?? imported?.['value']) === 'prop') {
        locals.add(local);
      }
    }
  }
  return { locals, ns };
}

/** Edits that replace the droppable first argument of each `prop.value(…)` call with `void 0`. */
export function stripPropSchemas(program: Node, code: string): Edit[] {
  const { locals, ns } = propImports(program);
  if (locals.size === 0 && ns.size === 0) return [];
  const edits: Edit[] = [];
  const scopes: Set<string>[] = [];
  const visible = (name: unknown, names: Set<string>): boolean =>
    typeof name === 'string' && names.has(name) && !scopes.some((s) => s.has(name));

  /** `prop.value` (or `ns.prop.value`) with `prop`/`ns` the imported binding. */
  const isPropValue = (callee: Node | undefined): boolean => {
    if (callee?.type !== 'MemberExpression' || callee['computed'] === true) return false;
    if (nodeAt(callee, 'property')?.['name'] !== 'value') return false;
    const object = nodeAt(callee, 'object');
    if (object?.type === 'Identifier') return visible(object['name'], locals);
    if (object?.type !== 'MemberExpression' || object['computed'] === true) return false;
    const base = nodeAt(object, 'object');
    return (
      nodeAt(object, 'property')?.['name'] === 'prop' &&
      base?.type === 'Identifier' &&
      visible(base['name'], ns)
    );
  };

  const walk = (node: Node): void => {
    const declared = scopeNames(node)?.filter((name) => locals.has(name) || ns.has(name));
    if (declared !== undefined && declared.length > 0) scopes.push(new Set(declared));
    if (node.type === 'CallExpression' && isPropValue(nodeAt(node, 'callee'))) {
      const [check] = nodesAt(node, 'arguments');
      if (check !== undefined && droppable(check)) {
        // Keep the line count, so every following line keeps its number.
        const lines = code.slice(check.start, check.end).split('\n').length - 1;
        edits.push({ start: check.start, end: check.end, text: `void 0${'\n'.repeat(lines)}` });
      }
    }
    for (const child of children(node)) walk(child);
    if (declared !== undefined && declared.length > 0) scopes.pop();
  };
  for (const statement of nodesAt(program, 'body')) walk(statement);
  return edits;
}

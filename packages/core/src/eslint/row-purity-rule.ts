// gyral/each-row-purity: rules 8 and 9 of view/09-template-rules.md (view/03-lists.md "Rows must
// be pure", "Keys"). A skipped row is only correct when its output depends on nothing but
// (item, picked), so `each`'s row may read only its own parameters and locals, module-level
// bindings, imports and globals; anything from an enclosing function (the view's `s`, `i`, `ctx`,
// its locals) must come through `pick`. Helper functions declared beside the row are followed
// (they may read only the same). And every `each` needs a key function.
import type { Rule, Scope } from 'eslint';
import { findVariable, isGyral, OPTIONS_SCHEMA, type Node, type NodeOf } from './imports.js';

type Fn =
  NodeOf<'ArrowFunctionExpression'> | NodeOf<'FunctionExpression'> | NodeOf<'FunctionDeclaration'>;

const isFn = (node: Node | null | undefined): node is Fn =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'FunctionDeclaration';

/** The function a binding holds when that is static: `function F`, or `const F = (…) => …`. */
function boundFunction(variable: Scope.Variable | null | undefined): Fn | undefined {
  const def = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (def?.type === 'FunctionName') return def.node as Fn;
  if (def?.type !== 'Variable' || def.parent.kind !== 'const') return undefined;
  const init = def.node.init as Node | null | undefined;
  return isFn(init) ? init : undefined;
}

/**
 * The function a `row` argument is: inline, or a name bound to one. Anything else (a call, a
 * parameter, a `let`) can't be followed statically; the development check (view/03) covers it.
 */
function rowFunction(context: Rule.RuleContext, row: Node): Fn | undefined {
  if (isFn(row)) return row;
  if (row.type !== 'Identifier') return undefined;
  return boundFunction(findVariable(context.sourceCode.getScope(row), row.name));
}

/**
 * The references in `fn` (nested functions included) to bindings of enclosing functions. A
 * helper beside the row (`const Cell = (…) => …` in the same function) is followed instead: it
 * is fine when it reads nothing from an enclosing function itself. `seen` stops recursion.
 */
function enclosingReads(context: Rule.RuleContext, fn: Fn, seen: Set<Fn>): Scope.Reference[] {
  seen.add(fn);
  return context.sourceCode.getScope(fn).through.filter((ref) => {
    if ('isValueReference' in ref && ref.isValueReference === false) return false; // a type
    const variable = ref.resolved;
    if (variable === null) return false; // a global
    const type = variable.scope.variableScope.type;
    if (type === 'module' || type === 'global') return false;
    const helper = boundFunction(variable);
    if (helper === undefined) return true;
    return !seen.has(helper) && enclosingReads(context, helper, seen).length > 0;
  });
}

/** `s`, or `s.selected` / `s.a.b` when the reference starts a property chain, and its node. */
function readOf(id: Node): { name: string; node: Node } {
  let name = id.type === 'Identifier' ? id.name : '';
  let node: Node = id;
  for (let p = node.parent; p?.type === 'MemberExpression'; p = p.parent) {
    if (p.object !== node || p.computed || p.property.type !== 'Identifier') break;
    name += `.${p.property.name}`;
    node = p;
  }
  return { name, node };
}

const isMissing = (key: Node): boolean =>
  (key.type === 'Identifier' && key.name === 'undefined') ||
  (key.type === 'Literal' && key.value === null);

export const rowPurityRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "each()'s row reads only its item, its picked value, module-level bindings and " +
        'imports; each() has a key function (view/03-lists.md, rules 8 and 9).',
      recommended: true,
      url: 'https://github.com/gyraljs/gyral/blob/main/docs/design-docs/view/03-lists.md',
    },
    schema: OPTIONS_SCHEMA,
    messages: {
      reads:
        '`row` reads `{{name}}`; return it from `pick` and take it as the second argument ' +
        '(view/03-lists.md).',
      key:
        'each() needs a key function as its second argument: each(items, (x) => x.id, Row) ' +
        '(docs/design-docs/view/03-lists.md "Keys", rule 9).',
    },
  },
  create(context) {
    const reported = new Set<Node>();
    return {
      CallExpression(node) {
        if (!isGyral(context, node.callee as Node, 'each')) return;
        const [, key, row] = node.arguments as Node[];
        if (key === undefined || row === undefined || isMissing(key)) {
          context.report({ node, messageId: 'key' });
        }
        const fn = row === undefined ? undefined : rowFunction(context, row);
        if (fn === undefined) return;
        for (const ref of enclosingReads(context, fn, new Set())) {
          const { name, node: read } = readOf(ref.identifier as Node);
          if (reported.has(read)) continue; // one row passed to several each() calls
          reported.add(read);
          context.report({ node: read, messageId: 'reads', data: { name } });
        }
      },
    };
  },
};

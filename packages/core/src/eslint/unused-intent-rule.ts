// gyral/unused-intent: the "unused intent parser" warning of view/09-template-rules.md. A parser
// in `define(tag, { intent: { Name: … } })` runs only when an element names it with
// `data-intent`, so a parser no template in the module names is a renamed intent or dead code.
// Static, over the whole module, so intents rendered conditionally (a dialog's buttons, an
// error state) count as used; that is why the warning lives here and not in the runtime, which
// sees only the templates rendered so far. A name counts as used when the module mentions it as
// a property (`i.Name`, `intents.Name`, `{ Name } = i`, `i['Name']`) or as a static or literal
// `data-intent` value in an html template. A component is skipped when its intent names may be
// used elsewhere: its view is not in the module (an imported function), the view hands its
// intents to an imported function, the module exports an `intents()` constant, or a template
// in the module calls (or passes on) a function imported from another module, which may render
// `data-intent="Name"` itself (a shared table header, a row module).
import type { Rule, Scope } from 'eslint';
import {
  findVariable,
  importedAs,
  isGyral,
  OPTIONS_SCHEMA,
  type Node,
  type NodeOf,
} from './imports.js';

/** A static `data-intent` value in template text. */
const STATIC_INTENT = /\sdata-intent=["']?([^"'\s>]+)/g;
/** Template text that ends where a `data-intent` hole starts. */
const INTENT_HOLE = /\sdata-intent=["']?$/;

interface Component {
  readonly parsers: readonly { readonly name: string; readonly node: Node }[];
  readonly view: Fn | undefined;
}

type Fn =
  NodeOf<'ArrowFunctionExpression'> | NodeOf<'FunctionExpression'> | NodeOf<'FunctionDeclaration'>;

const isFn = (node: Node | null | undefined): node is Fn =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'FunctionDeclaration';

const keyName = (key: Node): string | undefined =>
  key.type === 'Identifier'
    ? key.name
    : key.type === 'Literal' && typeof key.value === 'string'
      ? key.value
      : undefined;

/** `{ name: value }` entries of an object literal, without spreads or computed keys. */
function entries(object: Node): { name: string; key: Node; value: Node }[] {
  if (object.type !== 'ObjectExpression') return [];
  return object.properties.flatMap((p) => {
    if (p.type !== 'Property' || p.computed) return [];
    const name = keyName(p.key as Node);
    return name === undefined ? [] : [{ name, key: p.key as Node, value: p.value as Node }];
  });
}

/** Whether a variable is bound in this module (not imported, not a global). */
const isLocal = (variable: Scope.Variable | undefined): boolean =>
  variable !== undefined && variable.defs.length > 0 && variable.defs[0]?.type !== 'ImportBinding';

/** The function a view is: inline, or a module binding to one; undefined when elsewhere. */
function viewFunction(context: Rule.RuleContext, view: Node): Fn | undefined {
  if (isFn(view)) return view;
  if (view.type !== 'Identifier') return undefined;
  const variable = findVariable(context.sourceCode.getScope(view), view.name);
  const def = variable?.defs[0];
  if (def?.type === 'FunctionName') return def.node as Fn;
  const init = def?.type === 'Variable' ? (def.node.init as Node | null) : null;
  return isFn(init) ? init : undefined;
}

/** Whether `node` sits in a hole of a Gyral html template. */
function inTemplateHole(context: Rule.RuleContext, node: Node): boolean {
  for (let n: Node | null = node; n !== null; n = n.parent) {
    const parent = n.parent;
    if (parent?.type !== 'TemplateLiteral' || parent.parent.type !== 'TaggedTemplateExpression') {
      continue;
    }
    if (isGyral(context, parent.parent.tag as Node, 'html')) return true;
  }
  return false;
}

/**
 * Whether a template in the module calls, or passes on, a function imported from a module that
 * isn't a template source: its markup, which this rule can't see, may name intents.
 */
function templatesCallImports(context: Rule.RuleContext, program: Node): boolean {
  const global = context.sourceCode.getScope(program);
  const module = global.childScopes.find((scope) => scope.type === 'module') ?? global;
  return module.variables.some((v) => {
    const def = v.defs[0];
    if (def?.type !== 'ImportBinding') return false;
    if (importedAs(context, def.name as NodeOf<'Identifier'>) !== undefined) return false; // core
    return v.references.some((r) => {
      const id = r.identifier as Node;
      return id.parent?.type === 'CallExpression' && inTemplateHole(context, id);
    });
  });
}

/** Whether `id`'s reference stays in the module: `id.Name`, or an argument to a local function. */
function staysLocal(context: Rule.RuleContext, id: Node): boolean {
  const parent = id.parent;
  if (parent === null) return false;
  if (parent.type === 'MemberExpression' && parent.object === id) return true;
  if (parent.type !== 'CallExpression' || parent.callee === id) return false;
  const callee = parent.callee as Node;
  if (callee.type !== 'Identifier') return false;
  return isLocal(findVariable(context.sourceCode.getScope(callee), callee.name));
}

/** Whether the view's intents parameter (its second) can reach code outside the module. */
function viewEscapes(context: Rule.RuleContext, fn: Fn): boolean {
  const param = fn.params[1] as Node | undefined;
  if (param?.type !== 'Identifier') return false; // absent, or destructured (counted as used)
  const variable = context.sourceCode.getDeclaredVariables(fn).find((v) => v.name === param.name);
  return (variable?.references ?? []).some((r) => !staysLocal(context, r.identifier as Node));
}

export const unusedIntentRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'An intent parser that no template in the module names with data-intent: a renamed ' +
        'intent or dead code (view/09-template-rules.md "Warnings").',
      recommended: true,
      url: 'https://github.com/gyraljs/gyral/blob/main/docs/design-docs/view/09-template-rules.md',
    },
    schema: OPTIONS_SCHEMA,
    messages: {
      unused:
        'The intent parser "{{name}}" is never named by data-intent in this module, so it never ' +
        'runs: name it in the view (data-intent=${i.{{name}}}), or remove the parser (messages ' +
        'that only come from commands need none) (view/09-template-rules.md "Warnings").',
    },
  },
  create(context) {
    const used = new Set<string>();
    const components: Component[] = [];
    let exportsIntents = false;
    return {
      MemberExpression(node) {
        const name = node.computed ? keyName(node.property as Node) : undefined;
        if (!node.computed && node.property.type === 'Identifier') used.add(node.property.name);
        else if (name !== undefined) used.add(name);
      },
      ObjectPattern(node) {
        for (const p of node.properties) {
          const name = p.type === 'Property' && !p.computed ? keyName(p.key as Node) : undefined;
          if (name !== undefined) used.add(name);
        }
      },
      TaggedTemplateExpression(node) {
        if (!isGyral(context, node.tag as Node, 'html')) return;
        const { quasis, expressions } = node.quasi;
        quasis.forEach((q, k) => {
          const text = q.value.cooked ?? '';
          for (const m of text.matchAll(STATIC_INTENT)) used.add(m[1] ?? '');
          const value = expressions[k] as Node | undefined;
          if (INTENT_HOLE.test(text) && value?.type === 'Literal') used.add(String(value.value));
        });
      },
      CallExpression(node) {
        const callee = node.callee as Node;
        if (isGyral(context, callee, 'intents')) {
          // `export const i = intents<Msg>()`: other modules may name the intents.
          const declaration = node.parent.parent?.parent;
          if (declaration?.type === 'ExportNamedDeclaration') exportsIntents = true;
          return;
        }
        if (!isGyral(context, callee, 'define')) return;
        const spec = node.arguments[1] as Node | undefined;
        const fields = spec === undefined ? [] : entries(spec);
        const intent = fields.find((f) => f.name === 'intent')?.value;
        const view = fields.find((f) => f.name === 'view')?.value;
        if (intent === undefined) return;
        const parsers = entries(intent).map((e) => ({ name: e.name, node: e.key }));
        components.push({ parsers, view: view && viewFunction(context, view) });
      },
      'Program:exit'(program) {
        if (exportsIntents || components.length === 0) return;
        if (templatesCallImports(context, program as Node)) return;
        for (const { parsers, view } of components) {
          if (view === undefined || viewEscapes(context, view)) continue;
          for (const { name, node } of parsers) {
            if (!used.has(name)) context.report({ node, messageId: 'unused', data: { name } });
          }
        }
      },
    };
  },
};

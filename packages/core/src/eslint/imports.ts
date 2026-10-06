// Which identifiers are Gyral's `html` and `each` (@gyral/core/eslint). Like the template
// compiler (compiler/scan.ts), a binding counts only when it is imported from a template
// source: `import { html } from '@gyral/core'` (any local name) or `import * as g` used as
// `g.html`. ESLint's scope analysis resolves the name, so shadowing is handled. Core's own code
// and tests import from core's modules by relative path; those count too.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rule, Scope } from 'eslint';

export type Node = Rule.Node;
export type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>;

/** The default template sources, as in the Vite preset's `sources` option. */
export const DEFAULT_SOURCES: readonly string[] = ['@gyral/core'];

/** The options both rules take. */
export const OPTIONS_SCHEMA = [
  {
    type: 'object',
    properties: { sources: { type: 'array', items: { type: 'string' } } },
    additionalProperties: false,
  },
];

/** Core's modules that export `html` and `each` (this file is src/eslint/ or dist/eslint/). */
const CORE_MODULES = ['../index', '../view/index', '../view/template', '../view/render/values']
  .flatMap((name) => ['.ts', '.js'].map((ext) => new URL(`${name}${ext}`, import.meta.url)))
  .map((url) => fileURLToPath(url));

export function sourcesOf(context: Rule.RuleContext): readonly string[] {
  const options: unknown = context.options[0];
  const sources =
    typeof options === 'object' && options !== null && 'sources' in options
      ? options.sources
      : undefined;
  return Array.isArray(sources)
    ? sources.filter((s): s is string => typeof s === 'string')
    : DEFAULT_SOURCES;
}

function isSource(context: Rule.RuleContext, specifier: string): boolean {
  if (sourcesOf(context).includes(specifier)) return true;
  if (!specifier.startsWith('.')) return false;
  return CORE_MODULES.includes(resolve(dirname(context.filename), specifier));
}

/** typescript-eslint's `import type` marker (not in ESTree). */
const typeOnly = (node: object): boolean => 'importKind' in node && node.importKind === 'type';

export function findVariable(scope: Scope.Scope | null, name: string): Scope.Variable | undefined {
  for (let s = scope; s !== null; s = s.upper) {
    const v = s.set.get(name);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** How `id` was imported from a template source: the export's name, or `*`. */
function importedAs(context: Rule.RuleContext, id: NodeOf<'Identifier'>): string | undefined {
  const variable = findVariable(context.sourceCode.getScope(id), id.name);
  const def = variable?.defs[0];
  if (def?.type !== 'ImportBinding') return undefined;
  const declaration = def.parent;
  if (typeOnly(declaration) || !isSource(context, String(declaration.source.value))) {
    return undefined;
  }
  const spec = def.node;
  if (spec.type === 'ImportNamespaceSpecifier') return '*';
  if (spec.type !== 'ImportSpecifier' || typeOnly(spec)) return undefined;
  const { imported } = spec;
  return imported.type === 'Identifier' ? imported.name : String(imported.value);
}

/** Whether `node` (a tag or callee) is the template sources' `name` export. */
export function isGyral(context: Rule.RuleContext, node: Node, name: string): boolean {
  if (node.type === 'Identifier') return importedAs(context, node) === name;
  if (node.type !== 'MemberExpression' || node.computed || node.object.type !== 'Identifier') {
    return false;
  }
  const { property } = node;
  return (
    property.type === 'Identifier' &&
    property.name === name &&
    importedAs(context, node.object as NodeOf<'Identifier'>) === '*'
  );
}

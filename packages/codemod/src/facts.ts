// What a module declares, imports and assigns, collected once per file. The transforms use it
// to prove a rewrite safe without a type checker: a name they rely on must resolve to the
// module's declaration (scope.ts) and, where its value matters, never be reassigned.
import type { File, Identifier, Node } from '@babel/types';
import { stringValue, walk, type Visit } from './ast.js';
import { isFunctionNode, patternNames, shadowed } from './scope.js';

export interface ImportBinding {
  readonly source: string;
  /** The exported name; `default` for a default import, `*` for a namespace import. */
  readonly imported: string;
  readonly typeOnly: boolean;
}

export interface ModuleFacts {
  /** Local name → what it imports. */
  readonly imports: ReadonlyMap<string, ImportBinding>;
  /** Local name → how many declarations of it the file has, in any scope. */
  readonly bindings: ReadonlyMap<string, number>;
  /** Names assigned or updated somewhere (`x = …`, `x++`, destructuring assignments). */
  readonly assigned: ReadonlySet<string>;
}

function importedName(spec: Node): string {
  if (spec.type === 'ImportSpecifier') {
    return spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
  }
  return spec.type === 'ImportDefaultSpecifier' ? 'default' : '*';
}

export function moduleFacts(ast: File): ModuleFacts {
  const imports = new Map<string, ImportBinding>();
  const bindings = new Map<string, number>();
  const assigned = new Set<string>();
  const bind = (name: string): void => {
    bindings.set(name, (bindings.get(name) ?? 0) + 1);
  };
  walk(ast.program, ({ node }) => {
    if (isFunctionNode(node)) {
      if ('id' in node && node.id) bind(node.id.name);
      for (const param of node.params) patternNames(param).forEach(bind);
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
        for (const spec of node.specifiers) {
          bind(spec.local.name);
          imports.set(spec.local.name, {
            source: node.source.value,
            imported: importedName(spec),
            typeOnly:
              node.importKind === 'type' ||
              (spec.type === 'ImportSpecifier' && spec.importKind === 'type'),
          });
        }
        break;
      case 'VariableDeclarator':
        patternNames(node.id).forEach(bind);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id) bind(node.id.name);
        break;
      case 'CatchClause':
        patternNames(node.param).forEach(bind);
        break;
      case 'TSEnumDeclaration':
      case 'TSImportEqualsDeclaration':
        bind(node.id.name);
        break;
      case 'TSModuleDeclaration':
        if (node.id.type === 'Identifier') bind(node.id.name);
        break;
      case 'AssignmentExpression':
        patternNames(node.left).forEach((n) => assigned.add(n));
        break;
      case 'UpdateExpression':
        patternNames(node.argument).forEach((n) => assigned.add(n));
        break;
      case 'ForInStatement':
      case 'ForOfStatement':
        if (node.left.type !== 'VariableDeclaration') {
          patternNames(node.left).forEach((n) => assigned.add(n));
        }
        break;
      default:
        break;
    }
  });
  return { imports, bindings, assigned };
}

/**
 * Whether a step is an identifier used as a reference: not a property name (`a.name`,
 * `{ name: 1 }`) and not one of an import specifier's names.
 */
export function isReference({ node, key, ancestors }: Visit): boolean {
  const parent = ancestors.at(-1);
  if (node.type !== 'Identifier' || parent === undefined) return node.type === 'Identifier';
  if (parent.type.startsWith('Import') && parent.type.endsWith('Specifier')) return false;
  if (key === 'property') {
    return (
      (parent.type !== 'MemberExpression' && parent.type !== 'OptionalMemberExpression') ||
      parent.computed
    );
  }
  // A shorthand `{ name }` is reached again as its value, which is the reference.
  return key !== 'key' || !('computed' in parent) || parent.computed;
}

/** A reference to a name, with its ancestors (outermost first). */
export interface Reference {
  readonly node: Identifier;
  readonly ancestors: readonly Node[];
}

/**
 * Every identifier named `name` that isn't a property name or `declaration` itself: uses in
 * expressions, types (`typeof x`), exports and labels. Conservative: only meaningful for a
 * name declared once in the file.
 */
export function referencesTo(root: Node, name: string, declaration?: Node): Reference[] {
  const found: Reference[] = [];
  walk(root, (step) => {
    const { node, ancestors } = step;
    if (node.type !== 'Identifier' || node.name !== name || node === declaration) return;
    if (isReference(step)) found.push({ node, ancestors: [...ancestors] });
  });
  return found;
}

/**
 * Whether `callee` is `name` imported from `source`: `name` (or an alias of it) or `ns.name`
 * for `import * as ns`, not re-declared by a scope around it (`ancestors`, outermost first).
 */
export function resolvesTo(
  facts: ModuleFacts,
  callee: Node,
  ancestors: readonly Node[],
  source: string,
  name: string,
): boolean {
  let local: string | undefined;
  let imported = name;
  if (callee.type === 'Identifier') local = callee.name;
  else if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    (callee.computed ? stringValue(callee.property) : identifierName(callee.property)) === name
  ) {
    local = callee.object.name;
    imported = '*';
  }
  const binding = local === undefined ? undefined : facts.imports.get(local);
  return (
    local !== undefined &&
    binding !== undefined &&
    !binding.typeOnly &&
    binding.source === source &&
    binding.imported === imported &&
    (facts.bindings.get(local) === 1 || !shadowed(local, ancestors))
  );
}

function identifierName(node: Node): string | undefined {
  return node.type === 'Identifier' ? node.name : undefined;
}

/** The name a callee reads as (`name` or `x.name`), whatever it resolves to. */
export function calleeName(callee: Node): string | undefined {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') {
    return callee.computed ? stringValue(callee.property) : identifierName(callee.property);
  }
  return undefined;
}

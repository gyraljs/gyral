// A minimal view of the ESTree AST that Rolldown's `this.parse` returns (oxc, TypeScript
// included), for the template compiler's scanner (scan.ts): generic child iteration, the
// names a binding pattern declares, and the names each scope declares, so a local variable
// that shadows the imported `html` is never mistaken for it.

/** An ESTree node: `start`/`end` are UTF-16 offsets into the module's code. */
export interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

export const isNode = (value: unknown): value is Node =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

export const nodeAt = (node: Node, key: string): Node | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

/** The node or nodes at `key` (an array, or a single node). */
export const nodesAt = (node: Node, key: string): Node[] => {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : [];
};

/** TypeScript-only keys: type annotations never reference a value. */
const TYPE_KEYS = new Set([
  'typeAnnotation',
  'typeArguments',
  'typeParameters',
  'returnType',
  'superTypeArguments',
  'implements',
]);

/** TS nodes that wrap a runtime expression; every other `TS*` node is type-only. */
const TS_VALUE = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSExportAssignment',
]);

/** The child nodes of `node` that can contain runtime code, in source order. */
export function children(node: Node): Node[] {
  if (node.type.startsWith('TS')) {
    if (TS_VALUE.has(node.type)) return nodesAt(node, 'expression');
    if (node.type === 'TSParameterProperty') return nodesAt(node, 'parameter');
    if (node.type === 'TSModuleDeclaration') return nodesAt(node, 'body');
    if (node.type === 'TSModuleBlock') return nodesAt(node, 'body');
    return [];
  }
  const out: Node[] = [];
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end' || TYPE_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) out.push(...value.filter(isNode));
    else if (isNode(value)) out.push(value);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The names a binding pattern declares (`a`, `{ a, b: [c] }`, `...d`, `e = 1`). */
export function patternNames(pattern: Node | undefined): string[] {
  if (pattern === undefined) return [];
  switch (pattern.type) {
    case 'Identifier':
      return [pattern['name'] as string];
    case 'ObjectPattern':
      return nodesAt(pattern, 'properties').flatMap((p) =>
        p.type === 'RestElement'
          ? patternNames(nodeAt(p, 'argument'))
          : patternNames(nodeAt(p, 'value')),
      );
    case 'ArrayPattern':
      return nodesAt(pattern, 'elements').flatMap(patternNames);
    case 'RestElement':
      return patternNames(nodeAt(pattern, 'argument'));
    case 'AssignmentPattern':
      return patternNames(nodeAt(pattern, 'left'));
    case 'TSParameterProperty':
      return patternNames(nodeAt(pattern, 'parameter'));
    default:
      return [];
  }
}

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

export const isFunction = (node: Node): boolean => FUNCTIONS.has(node.type);

/** `var` names declared anywhere in a function body (hoisted), not crossing nested functions. */
function varNames(node: Node, out: string[]): void {
  if (node.type === 'VariableDeclaration' && node['kind'] === 'var') {
    for (const d of nodesAt(node, 'declarations')) out.push(...patternNames(nodeAt(d, 'id')));
  }
  for (const child of children(node)) if (!isFunction(child)) varNames(child, out);
}

/** Block-scoped names declared directly in a list of statements. */
function lexicalNames(statements: readonly Node[]): string[] {
  return statements.flatMap((s) => {
    if (s.type === 'VariableDeclaration' && s['kind'] !== 'var') {
      return nodesAt(s, 'declarations').flatMap((d) => patternNames(nodeAt(d, 'id')));
    }
    if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') {
      return patternNames(nodeAt(s, 'id'));
    }
    return [];
  });
}

/**
 * The names `node` declares for its own scope, or undefined when it opens no scope. The
 * Program scope is left out: the imported binding lives there.
 */
export function scopeNames(node: Node): string[] | undefined {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const names = nodesAt(node, 'params').flatMap(patternNames);
      if (node.type === 'FunctionExpression') names.push(...patternNames(nodeAt(node, 'id')));
      const body = nodeAt(node, 'body');
      if (body?.type === 'BlockStatement') {
        varNames(body, names);
        names.push(...lexicalNames(nodesAt(body, 'body')));
      }
      return names;
    }
    case 'BlockStatement':
    case 'StaticBlock':
      return lexicalNames(nodesAt(node, 'body'));
    case 'SwitchStatement':
      return lexicalNames(nodesAt(node, 'cases').flatMap((c) => nodesAt(c, 'consequent')));
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = nodeAt(node, node.type === 'ForStatement' ? 'init' : 'left');
      return head === undefined ? [] : lexicalNames([head]);
    }
    case 'CatchClause':
      return patternNames(nodeAt(node, 'param'));
    case 'ClassExpression':
      return patternNames(nodeAt(node, 'id'));
    default:
      return undefined;
  }
}

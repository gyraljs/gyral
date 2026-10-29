// Scopes, without a scope analyzer: which names a pattern declares, and whether a scope
// between a reference and the module re-declares a name (so the reference isn't the module's).
import type {
  ArrowFunctionExpression,
  ClassMethod,
  ClassPrivateMethod,
  FunctionDeclaration,
  FunctionExpression,
  Node,
  ObjectMethod,
  TSDeclareFunction,
  TSDeclareMethod,
} from '@babel/types';
import { contains } from './ast.js';

export type FunctionNode =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunctionExpression
  | ObjectMethod
  | ClassMethod
  | ClassPrivateMethod
  | TSDeclareFunction
  | TSDeclareMethod;

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
  'TSDeclareFunction',
  'TSDeclareMethod',
]);

/** A function with a scope of its own (not a function type). */
export const isFunctionNode = (node: Node): node is FunctionNode => FUNCTION_TYPES.has(node.type);

/** The names a binding pattern (or assignment target) declares. */
export function patternNames(node: Node | null | undefined): string[] {
  switch (node?.type) {
    case 'Identifier':
      return [node.name];
    case 'ObjectPattern':
      return node.properties.flatMap((p) => patternNames(p.type === 'RestElement' ? p : p.value));
    case 'ArrayPattern':
      return node.elements.flatMap((e) => patternNames(e));
    case 'AssignmentPattern':
      return patternNames(node.left);
    case 'RestElement':
      return patternNames(node.argument);
    case 'TSParameterProperty':
      return patternNames(node.parameter);
    default:
      return [];
  }
}

/** Whether a statement declares `name` in the scope it sits in. */
function statementDeclares(statement: Node, name: string): boolean {
  const node =
    statement.type === 'ExportNamedDeclaration' && statement.declaration
      ? statement.declaration
      : statement;
  switch (node.type) {
    case 'VariableDeclaration':
      return node.declarations.some((d) => patternNames(d.id).includes(name));
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
      return node.id?.name === name;
    default:
      return false;
  }
}

/** A `var` anywhere in a function body (outside nested functions) is the function's. */
const hoistsVar = (body: Node, name: string): boolean =>
  contains(
    body,
    (n) => n.type === 'VariableDeclaration' && n.kind === 'var' && statementDeclares(n, name),
    isFunctionNode,
  );

function scopeDeclares(scope: Node, name: string): boolean {
  switch (scope.type) {
    case 'BlockStatement':
    case 'StaticBlock':
    case 'TSModuleBlock':
      return scope.body.some((s) => statementDeclares(s, name));
    case 'SwitchStatement':
      return scope.cases.some((c) => c.consequent.some((s) => statementDeclares(s, name)));
    case 'CatchClause':
      return patternNames(scope.param).includes(name);
    case 'ForStatement':
      return scope.init?.type === 'VariableDeclaration' && statementDeclares(scope.init, name);
    case 'ForInStatement':
    case 'ForOfStatement':
      return scope.left.type === 'VariableDeclaration' && statementDeclares(scope.left, name);
    case 'ClassExpression':
      return scope.id?.name === name;
    case 'FunctionExpression':
      if (scope.id?.name === name) return true;
      break;
    default:
      break;
  }
  if (!isFunctionNode(scope)) return false;
  if (scope.params.some((p) => patternNames(p).includes(name))) return true;
  return 'body' in scope && hoistsVar(scope.body, name);
}

/**
 * Whether a scope between a reference and the module re-declares `name`, so that the reference
 * isn't to the module's (or an import's) `name`. `ancestors` are the reference's, outermost first.
 */
export function shadowed(name: string, ancestors: readonly Node[]): boolean {
  return ancestors.some((scope) => scope.type !== 'Program' && scopeDeclares(scope, name));
}

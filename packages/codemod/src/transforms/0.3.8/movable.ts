// Can `const p = gyralVitePreset(o)` become `gyral(o)` where `...p.plugins` is? Only if
// evaluating `o` there gives what it gave at the declaration: `o` runs no code itself, every name
// it reads is the same binding at both places, and when it reads a local name (whose object
// something could change), no code runs between the two points.
import type { Node } from '@babel/types';
import { lineOf, walk } from '../../ast.js';
import { isReference, type ModuleFacts } from '../../facts.js';
import { isFunctionNode } from '../../scope.js';

const EFFECTS: ReadonlySet<string> = new Set([
  'CallExpression',
  'OptionalCallExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'AwaitExpression',
  'YieldExpression',
  'ImportExpression',
  'ClassExpression',
]);

const isEffect = (node: Node): boolean =>
  EFFECTS.has(node.type) || (node.type === 'UnaryExpression' && node.operator === 'delete');

/** Nodes under `root` that run code when it is evaluated (not inside nested functions). */
function effects(root: Node, before = Number.POSITIVE_INFINITY): Node[] {
  const found: Node[] = [];
  walk(
    root,
    ({ node }) => {
      if (isEffect(node) && (node.end ?? 0) <= before) found.push(node);
    },
    isFunctionNode,
  );
  return found;
}

/** Statements that run no code of their own between two points of a block. */
function inert(statement: Node): boolean {
  const node =
    statement.type === 'ExportNamedDeclaration' ? (statement.declaration ?? undefined) : statement;
  switch (node?.type) {
    case undefined:
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
    case 'FunctionDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSDeclareFunction':
    case 'EmptyStatement':
      return true;
    case 'VariableDeclaration':
      return effects(node).length === 0;
    default:
      return false;
  }
}

export interface Move {
  /** The preset call's arguments. */
  readonly args: readonly Node[];
  /** The `const p = …` statement and the block it is a statement of. */
  readonly declaration: Node;
  readonly block: Node & { readonly body: readonly Node[] };
  /** The `...p.plugins` spread and its ancestors, outermost first. */
  readonly use: Node;
  readonly ancestors: readonly Node[];
  readonly facts: ModuleFacts;
}

/** The names `args` read outside nested functions that the file declares, or why they can't move. */
function localReads({ args, facts }: Move): string[] | string {
  const locals: string[] = [];
  let why: string | undefined;
  for (const arg of args) {
    const [effect] = effects(arg);
    if (effect !== undefined)
      return `its options run code (line ${String(lineOf(effect))}); inline them by hand`;
    walk(arg, (step) => {
      const { node, ancestors } = step;
      if (why !== undefined) return;
      if (node.type === 'ThisExpression' || node.type === 'Super') why = 'its options read `this`';
      if (node.type !== 'Identifier' || !isReference(step)) return;
      const declared = facts.bindings.get(node.name) ?? 0;
      if (node.name === 'arguments' || declared > 1 || facts.assigned.has(node.name)) {
        why = `its options read \`${node.name}\`, which is declared more than once or reassigned`;
      } else if (declared === 1 && !ancestors.some(isFunctionNode)) locals.push(node.name);
    });
  }
  return why ?? locals;
}

/** Why the preset's options can't move to its plugins' use, or undefined if they can. */
export function cannotMove(move: Move): string | undefined {
  const reads = localReads(move);
  if (typeof reads === 'string') return reads;
  const [name] = reads;
  if (name === undefined) return undefined; // literals and globals read the same anywhere
  const { block, declaration, use, ancestors } = move;
  const below = ancestors.slice(ancestors.indexOf(block) + 1);
  const statement = below[0] ?? use;
  const reason = (what: string): string =>
    `its options read \`${name}\`, and ${what}; inline them by hand`;
  const runs = (node: Node): string =>
    reason(`line ${String(lineOf(node))} runs before its plugins are used and could change it`);
  if (below.some(isFunctionNode)) {
    return reason('its plugins are used inside a function that runs later');
  }
  const from = block.body.indexOf(declaration) + 1;
  const between = block.body.slice(from, block.body.indexOf(statement)).find((s) => !inert(s));
  if (between !== undefined) return runs(between);
  // Within the statement, what ends before the spread is evaluated before it.
  const [before] = effects(statement, use.start ?? 0);
  return before === undefined ? undefined : runs(before);
}

// const preset = gyralVitePreset(o); … plugins: [...preset.plugins, mine()]
//   → plugins: [gyral(o), mine()], the declaration removed, and a `...preset.optimizeDeps`
//   spread dropped when nothing else in that optimizeDeps depends on it.
// Only when `preset` has no other use, and `o` can move there unchanged (movable.ts).
import type {
  BlockStatement,
  Node,
  ObjectExpression,
  ObjectProperty,
  Program,
  SpreadElement,
  StaticBlock,
  TSModuleBlock,
} from '@babel/types';
import {
  contains,
  endOf,
  keyName,
  lineOf,
  removeListItem,
  removeStatement,
  startOf,
  textOf,
} from '../../ast.js';
import { referencesTo } from '../../facts.js';
import { cannotMove } from './movable.js';
import type { Outcome, Site, ViteContext } from './vite-plugin.js';

type Use =
  | {
      readonly kind: 'plugins';
      readonly spread: SpreadElement;
      /** The spread's ancestors, outermost first. */
      readonly ancestors: readonly Node[];
    }
  | {
      readonly kind: 'optimizeDeps';
      readonly property: ObjectProperty;
      readonly owner: ObjectExpression;
      readonly spread?: SpreadElement;
    }
  | { readonly kind: 'other'; readonly node: Node };

const isKey = (node: Node | undefined, key: string, value: Node): node is ObjectProperty =>
  node?.type === 'ObjectProperty' && node.value === value && keyName(node) === key;

/** What a reference to the preset's variable does. */
function classify(node: Node, ancestors: readonly Node[]): Use {
  const [member, p1, p2, p3, p4] = [...ancestors].reverse();
  if (member?.type !== 'MemberExpression' || member.object !== node || member.computed)
    return { kind: 'other', node };
  const property = member.property.type === 'Identifier' ? member.property.name : '';
  const spread = p1?.type === 'SpreadElement' && p1.argument === member ? p1 : undefined;
  if (
    property === 'plugins' &&
    spread &&
    p2?.type === 'ArrayExpression' &&
    isKey(p3, 'plugins', p2)
  ) {
    return { kind: 'plugins', spread, ancestors: ancestors.slice(0, -2) };
  }
  if (property !== 'optimizeDeps') return { kind: 'other', node };
  if (
    spread &&
    p2?.type === 'ObjectExpression' &&
    isKey(p3, 'optimizeDeps', p2) &&
    p4?.type === 'ObjectExpression'
  ) {
    return { kind: 'optimizeDeps', property: p3, owner: p4, spread };
  }
  if (isKey(p1, 'optimizeDeps', member) && p2?.type === 'ObjectExpression') {
    return { kind: 'optimizeDeps', property: p1, owner: p2 };
  }
  return { kind: 'other', node };
}

/** An item to remove from a comma-separated list. */
interface Removal {
  readonly list: readonly Node[];
  readonly index: number;
}

/**
 * How to drop the optimizeDeps use: the whole `optimizeDeps` property when the preset's is all
 * of it, else just the spread. A string says why it has to stay.
 */
function optimizeRemoval(
  use: Extract<Use, { kind: 'optimizeDeps' }>,
  name: string,
): Removal | string {
  const { property, owner, spread } = use;
  const object = property.value;
  if (
    spread === undefined ||
    object.type !== 'ObjectExpression' ||
    object.properties.length === 1
  ) {
    return { list: owner.properties, index: owner.properties.indexOf(property) };
  }
  const index = object.properties.indexOf(spread);
  const earlier = object.properties.slice(0, index);
  if (earlier.some((p) => p.type === 'SpreadElement' || keyName(p) === 'include')) {
    return `an \`include\` before \`...${name}.optimizeDeps\` is replaced by it today`;
  }
  if (contains(object, (n) => n.type === 'StringLiteral' && n.value.startsWith('@gyral/'))) {
    return 'its optimizeDeps names Gyral packages, which gyral() pre-bundles itself; review it by hand';
  }
  return { list: object.properties, index };
}

type Block = Program | BlockStatement | StaticBlock | TSModuleBlock;

const isBlock = (node: Node | undefined): node is Block =>
  node?.type === 'Program' ||
  node?.type === 'BlockStatement' ||
  node?.type === 'StaticBlock' ||
  node?.type === 'TSModuleBlock';

export function presetConst(context: ViteContext, { call, ancestors }: Site): Outcome {
  const [declarator, declaration, block] = [...ancestors].reverse();
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.init !== call ||
    declarator.id.type !== 'Identifier'
  ) {
    return 'other';
  }
  const { name } = declarator.id;
  const leave = (why: string): Outcome => {
    context.report(declarator, `\`${name} = gyralVitePreset(…)\` left as is: ${why}`);
    return 'left';
  };
  if (
    declaration?.type !== 'VariableDeclaration' ||
    declaration.kind !== 'const' ||
    declaration.declarations.length !== 1
  ) {
    return leave('declare it on its own, with const');
  }
  if (!isBlock(block)) {
    return leave(
      block?.type === 'ExportNamedDeclaration'
        ? 'it is exported'
        : 'it is not a statement of its own',
    );
  }
  if (context.facts.bindings.get(name) !== 1)
    return leave(`\`${name}\` is declared more than once in this file`);
  const uses = referencesTo(context.ast.program, name, declarator.id).map((r) =>
    classify(r.node, r.ancestors),
  );
  const other = uses.find((u) => u.kind === 'other');
  if (other !== undefined)
    return leave(`\`${name}\` has another use (line ${String(lineOf(other.node))})`);
  const plugins = uses.filter((u) => u.kind === 'plugins');
  const optimize = uses.filter((u) => u.kind === 'optimizeDeps');
  const [use] = plugins;
  if (use === undefined || plugins.length > 1) {
    return leave(
      `it needs exactly one \`...${name}.plugins\` in a plugins list (found ${String(plugins.length)})`,
    );
  }
  if (optimize.length > 1)
    return leave(`\`${name}.optimizeDeps\` is used ${String(optimize.length)} times`);
  if (startOf(use.spread) < endOf(declaration) || endOf(use.spread) > endOf(block)) {
    return leave(`\`...${name}.plugins\` is outside its scope`);
  }
  const why = cannotMove({
    args: call.arguments,
    declaration,
    block,
    use: use.spread,
    ancestors: use.ancestors,
    facts: context.facts,
  });
  if (why !== undefined) return leave(why);
  const [optimizeUse] = optimize;
  const removal = optimizeUse === undefined ? undefined : optimizeRemoval(optimizeUse, name);
  if (typeof removal === 'string') return leave(removal);
  const args = textOf(context.code, call.arguments);
  context.edit.overwrite(startOf(use.spread), endOf(use.spread), `${context.gyral}(${args})`);
  removeStatement(context.edit, context.code, declaration);
  if (removal !== undefined) removeListItem(context.edit, removal.list, removal.index);
  return 'done';
}

// gyralVitePreset(options) → gyral(options), the plugin list from @gyral/core/vite:
//   defineConfig(gyralVitePreset(o))      → defineConfig({ plugins: [gyral(o)] })
//   { ...gyralVitePreset(o), build }      → { plugins: [gyral(o)], build }   (no plugins key)
//   gyralVitePreset(o).plugins            → gyral(o)
//   ...(gyralVitePreset(o).plugins ?? []) → ...gyral(o)  (gyral() always returns an array)
//   const p = gyralVitePreset(o); … plugins: [...p.plugins] → plugins: [gyral(o)]  (vite-preset-const.ts)
// The preset's optimizeDeps only listed `optimize`'s modules, which gyral() adds by itself.
import type { CallExpression, ImportDeclaration, ImportSpecifier, Node } from '@babel/types';
import {
  endOf,
  hasKey,
  keyName,
  removeListItem,
  removeStatement,
  startOf,
  stringValue,
} from '../../ast.js';
import { calleeName, referencesTo } from '../../facts.js';
import type { Transform, TransformContext } from '../types.js';
import { presetConst } from './vite-preset-const.js';

export const VITE = '@gyral/core/vite';
const CONFIG_CALLS: ReadonlySet<string> = new Set(['defineConfig', 'defineProject']);

export interface ViteContext extends TransformContext {
  /** What to call: `gyral`, or the local name of an existing `gyral` import. */
  readonly gyral: string;
}

/** A gyralVitePreset(…) call and its ancestors (outermost first; the last is its parent). */
export interface Site {
  readonly call: CallExpression;
  readonly ancestors: readonly Node[];
}

/** done: rewritten; left: reported and left as is; other: not this shape. */
export type Outcome = 'done' | 'left' | 'other';

export function renameCallee(context: ViteContext, call: CallExpression): void {
  context.edit.overwrite(startOf(call.callee), endOf(call.callee), context.gyral);
}

function inConfigCall(context: ViteContext, { call, ancestors }: Site): Outcome {
  const parent = ancestors.at(-1);
  if (parent?.type !== 'CallExpression' || parent.arguments.length !== 1) return 'other';
  const name = calleeName(parent.callee);
  if (parent.arguments[0] !== call || name === undefined || !CONFIG_CALLS.has(name)) return 'other';
  renameCallee(context, call);
  context.edit.appendLeft(startOf(call), '{ plugins: [');
  context.edit.appendLeft(endOf(call), '] }');
  return 'done';
}

function spreadInObject(context: ViteContext, { call, ancestors }: Site): Outcome {
  const spread = ancestors.at(-1);
  const object = ancestors.at(-2);
  if (spread?.type !== 'SpreadElement' || object?.type !== 'ObjectExpression') return 'other';
  if (hasKey(object.properties, 'plugins')) {
    context.report(
      call,
      'gyralVitePreset(…) left as is: the object has its own `plugins`; put gyral(…) in that list by hand',
    );
    return 'left';
  }
  const earlier = object.properties.slice(0, object.properties.indexOf(spread));
  const overridden = earlier.find(
    (p) => p.type === 'SpreadElement' || keyName(p) === 'optimizeDeps',
  );
  if (overridden !== undefined) {
    const what = overridden.type === 'SpreadElement' ? 'a spread' : '`optimizeDeps`';
    context.report(
      call,
      `gyralVitePreset(…) left as is: ${what} before it loses its optimizeDeps to the preset today, and wouldn't with gyral(); rewrite it by hand`,
    );
    return 'left';
  }
  context.edit.overwrite(startOf(spread), startOf(call), 'plugins: [');
  renameCallee(context, call);
  context.edit.appendLeft(endOf(call), ']');
  return 'done';
}

/** `[]`, also as `[] as Plugin[]`. */
function isEmptyArray(node: Node): boolean {
  const n =
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSTypeAssertion'
      ? node.expression
      : node;
  return n.type === 'ArrayExpression' && n.elements.length === 0;
}

/**
 * A `?? []` or `|| []` after the preset's plugins is dead once they are gyral()'s, which is
 * always an array (gyral-68h). Removes it, and the parentheses it needed when only whitespace
 * separates them from it: `...(gyralVitePreset().plugins ?? [])` → `...gyral()`.
 */
function dropFallback(context: ViteContext, member: Node, fallback: Node | undefined): void {
  if (
    fallback?.type !== 'LogicalExpression' ||
    fallback.left !== member ||
    fallback.operator === '&&' ||
    !isEmptyArray(fallback.right)
  ) {
    return;
  }
  const { code, edit } = context;
  edit.remove(endOf(member), endOf(fallback));
  const open = fallback.extra?.parenStart;
  const close = /^\s*\)/.exec(code.slice(endOf(fallback)));
  if (
    fallback.extra?.parenthesized === true &&
    typeof open === 'number' &&
    close !== null &&
    code.slice(open + 1, startOf(fallback)).trim() === ''
  ) {
    edit.remove(open, startOf(fallback));
    edit.remove(endOf(fallback), endOf(fallback) + close[0].length);
  }
}

function pluginsOf(context: ViteContext, { call, ancestors }: Site): Outcome {
  const member = ancestors.at(-1);
  if (member?.type !== 'MemberExpression' || member.object !== call) return 'other';
  const property = member.computed ? stringValue(member.property) : calleeName(member);
  if (property !== 'plugins') return 'other';
  renameCallee(context, call);
  context.edit.remove(endOf(call), endOf(member));
  dropFallback(context, member, ancestors.at(-2));
  return 'done';
}

const SHAPES = [inConfigCall, spreadInObject, pluginsOf, presetConst];

interface Found {
  readonly declaration: ImportDeclaration;
  readonly specifier: ImportSpecifier;
}

/** The value import of `name` from @gyral/core/vite. */
function importOf(context: TransformContext, name: string): Found | undefined {
  for (const declaration of context.ast.program.body) {
    if (declaration.type !== 'ImportDeclaration' || declaration.source.value !== VITE) continue;
    if (declaration.importKind === 'type') continue;
    for (const specifier of declaration.specifiers) {
      if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') continue;
      const imported = specifier.imported;
      if ((imported.type === 'Identifier' ? imported.name : imported.value) === name) {
        return { declaration, specifier };
      }
    }
  }
  return undefined;
}

function fixImport(
  context: TransformContext,
  preset: Found,
  gyral: Found | undefined,
  left: number,
): void {
  const { declaration, specifier } = preset;
  if (left > 0) {
    if (gyral === undefined) context.edit.appendLeft(startOf(specifier), 'gyral, ');
  } else if (gyral === undefined) {
    context.edit.overwrite(startOf(specifier), endOf(specifier), 'gyral');
  } else if (declaration.specifiers.length === 1) {
    removeStatement(context.edit, context.code, declaration);
  } else {
    removeListItem(context.edit, declaration.specifiers, declaration.specifiers.indexOf(specifier));
  }
}

export const vitePlugin: Transform = {
  id: 'vite-plugin',
  summary: "gyralVitePreset(options) → gyral(options), @gyral/core/vite's plugin list",
  run(context) {
    const preset = importOf(context, 'gyralVitePreset');
    if (preset === undefined) return;
    const { facts, report } = context;
    const local = preset.specifier.local.name;
    const gyral = importOf(context, 'gyral');
    const name = gyral?.specifier.local.name ?? 'gyral';
    // The calls it adds must reach the import: no other declaration of the name, in any scope.
    const blocked =
      (facts.bindings.get(name) ?? 0) > (gyral === undefined ? 0 : 1)
        ? `\`${name}\` is already declared in this file; rename it, then run again`
        : facts.bindings.get(local) === 1
          ? undefined
          : `\`${local}\` is declared more than once in this file`;
    const vite: ViteContext = { ...context, gyral: name };
    let done = 0;
    let left = 0;
    for (const { node, ancestors } of referencesTo(
      context.ast.program,
      local,
      preset.specifier.local,
    )) {
      const call = ancestors.at(-1);
      let outcome: Outcome = 'left';
      if (blocked !== undefined) report(node, `gyralVitePreset left as is: ${blocked}`);
      else if (call?.type !== 'CallExpression' || call.callee !== node) {
        report(
          node,
          'gyralVitePreset left as is: it is used without being called; use gyral by hand',
        );
      } else {
        const site = { call, ancestors: ancestors.slice(0, -1) };
        outcome = 'other';
        for (const shape of SHAPES) if (outcome === 'other') outcome = shape(vite, site);
        if (outcome === 'other') {
          report(
            call,
            "gyralVitePreset(…) left as is: its result is used in a way this codemod doesn't rewrite; use plugins: [gyral(…)] by hand",
          );
        }
      }
      if (outcome === 'done') done += 1;
      else left += 1;
    }
    if (done > 0) fixImport(context, preset, gyral, left);
  },
};

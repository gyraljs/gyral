/// <reference types="node" />
// Parsing and AST helpers. The codemod parses with @babel/parser, never the app's TypeScript
// (whose API TypeScript 7 changes), and edits text ranges with magic-string so that code it
// doesn't touch keeps its formatting.
import { parse } from '@babel/parser';
import type { File, Node, ObjectMethod, ObjectProperty } from '@babel/types';
import type MagicString from 'magic-string';

export type Parsed =
  { readonly ok: true; readonly ast: File } | { readonly ok: false; readonly error: string };

/** Parses a module: TypeScript for .ts/.mts/.cts/.tsx, JSX for .tsx/.jsx, plain JS otherwise. */
export function parseModule(code: string, path: string): Parsed {
  const typescript = /\.[mc]?tsx?$/.test(path);
  const jsx = /\.[jt]sx$/.test(path);
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: [
        ...(typescript ? (['typescript'] as const) : []),
        ...(jsx ? (['jsx'] as const) : []),
      ],
    });
    return { ok: true, ast };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const SKIP_KEYS = new Set([
  'loc',
  'start',
  'end',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'comments',
  'tokens',
  'errors',
]);

export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}

/** A node reached by `walk`, with the key it sits under in its parent and every ancestor. */
export interface Visit {
  readonly node: Node;
  readonly key: string;
  /** Outermost first; the last one is the parent. Copy it to keep it past the callback. */
  readonly ancestors: readonly Node[];
}

/**
 * Visits every node below `root` (root included), parents first. `skip` stops the walk from
 * entering a node's children (the node itself is still visited).
 */
export function walk(
  root: Node,
  visit: (step: Visit) => void,
  skip: (node: Node) => boolean = () => false,
): void {
  const ancestors: Node[] = [];
  const go = (node: Node, key: string): void => {
    visit({ node, key, ancestors });
    if (skip(node) && node !== root) return;
    ancestors.push(node);
    for (const [childKey, value] of Object.entries(node as unknown as Record<string, unknown>)) {
      if (SKIP_KEYS.has(childKey)) continue;
      if (Array.isArray(value)) {
        for (const item of value as unknown[]) if (isNode(item)) go(item, childKey);
      } else if (isNode(value)) go(value, childKey);
    }
    ancestors.pop();
  };
  go(root, '');
}

/** Whether `root` or any node below it (not below a `skip` node) passes `test`. */
export function contains(
  root: Node,
  test: (node: Node) => boolean,
  skip?: (node: Node) => boolean,
): boolean {
  let found: Node | undefined;
  walk(
    root,
    ({ node }) => {
      if (found === undefined && test(node)) found = node;
    },
    skip,
  );
  return found !== undefined;
}

export function startOf(node: Node): number {
  if (typeof node.start !== 'number') throw new Error(`${node.type} has no position`);
  return node.start;
}

export function endOf(node: Node): number {
  if (typeof node.end !== 'number') throw new Error(`${node.type} has no position`);
  return node.end;
}

export function lineOf(node: Node): number {
  return node.loc?.start.line ?? 0;
}

/** The value of a string literal, or of a template literal without substitutions. */
export function stringValue(node: Node | null | undefined): string | undefined {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** A property's key as a string: `name`, `'name'` or `['name']`; undefined for other keys. */
export function keyName(prop: ObjectProperty | ObjectMethod): string | undefined {
  if (prop.key.type === 'Identifier' && !prop.computed) return prop.key.name;
  return stringValue(prop.key);
}

/** Whether an object literal has a property (or method) with this key. */
export function hasKey(properties: readonly Node[], key: string): boolean {
  return properties.some(
    (p) => (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && keyName(p) === key,
  );
}

/** Removes `items[index]` from a comma-separated list, with one of its commas. */
export function removeListItem(edit: MagicString, items: readonly Node[], index: number): void {
  const item = items[index];
  if (item === undefined) return;
  const next = items[index + 1];
  const previous = items[index - 1];
  if (next !== undefined) edit.remove(startOf(item), startOf(next));
  else if (previous !== undefined) edit.remove(endOf(previous), endOf(item));
  else edit.remove(startOf(item), endOf(item));
}

/** Removes a statement, with its line when nothing else is on it (and one blank line after). */
export function removeStatement(edit: MagicString, code: string, statement: Node): void {
  const start = startOf(statement);
  const end = endOf(statement);
  const lineStart = code.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = code.indexOf('\n', end);
  const restEnd = lineEnd === -1 ? code.length : lineEnd;
  if (code.slice(lineStart, start).trim() !== '' || code.slice(end, restEnd).trim() !== '') {
    edit.remove(start, end);
    return;
  }
  let to = Math.min(code.length, restEnd + 1);
  const blankBefore = lineStart === 0 || /\n\r?\n$/.test(code.slice(0, lineStart));
  const blankAfter = /^\r?\n/.exec(code.slice(to));
  if (blankBefore && blankAfter !== null) to += blankAfter[0].length;
  edit.remove(lineStart, to);
}

/** The source text of a node list, from the first one's start to the last one's end. */
export function textOf(code: string, nodes: readonly Node[]): string {
  const first = nodes[0];
  const last = nodes.at(-1);
  return first === undefined || last === undefined ? '' : code.slice(startOf(first), endOf(last));
}

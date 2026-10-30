// The shapes gyral/prefer-built-in (prefer-built-in-rule.ts) looks for, and the AST helpers its
// checks share: functions, members and globals through TypeScript's wrappers, a generic walk,
// and containment by source range.
import type { Rule } from 'eslint';
import { findVariable, type Node, type NodeOf } from './imports.js';

export type Fn =
  NodeOf<'ArrowFunctionExpression'> | NodeOf<'FunctionExpression'> | NodeOf<'FunctionDeclaration'>;

export const isFn = (node: Node | null | undefined): node is Fn =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'FunctionDeclaration';

const WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression']);

/** `node` without TypeScript's `as`, `!` or `satisfies`, or an optional chain, around it. */
export function unwrap(node: Node): Node {
  let n = node;
  for (;;) {
    if (n.type === 'ChainExpression') n = n.expression as Node;
    else if (WRAPPERS.has(n.type)) n = (n as unknown as { readonly expression: Node }).expression;
    else return n;
  }
}

/** `node` without wrappers or a `?? fallback` / `|| fallback` after it. */
export function operand(node: Node): Node {
  const n = unwrap(node);
  return n.type === 'LogicalExpression' && n.operator !== '&&' ? operand(n.left as Node) : n;
}

export const keyName = (key: Node): string | undefined =>
  key.type === 'Identifier'
    ? key.name
    : key.type === 'Literal' && typeof key.value === 'string'
      ? key.value
      : undefined;

/** The property a member expression reads by name: `a.b` or `a['b']`. */
export function memberName(node: Node): string | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  const property = node.property as Node;
  return node.computed
    ? property.type === 'Literal'
      ? keyName(property)
      : undefined
    : keyName(property);
}

/** The value of an object literal's `name` property (not computed, not spread). */
export function property(object: Node | undefined, name: string): Node | undefined {
  if (object?.type !== 'ObjectExpression') return undefined;
  for (const p of object.properties) {
    if (p.type === 'Property' && !p.computed && keyName(p.key as Node) === name) {
      return p.value as Node;
    }
  }
  return undefined;
}

/** Whether `node` is the global `name` (in `names`), not a local binding of that name. */
export function isGlobal(
  context: Rule.RuleContext,
  node: Node,
  names: ReadonlySet<string>,
): boolean {
  if (node.type !== 'Identifier' || !names.has(node.name)) return false;
  const variable = findVariable(context.sourceCode.getScope(node), node.name);
  return variable === undefined || variable.defs.length === 0;
}

/** The function `node` is: inline, or a module binding to one; undefined otherwise. */
export function localFunction(context: Rule.RuleContext, node: Node | undefined): Fn | undefined {
  if (node === undefined || isFn(node)) return node;
  if (node.type !== 'Identifier') return undefined;
  const def = findVariable(context.sourceCode.getScope(node), node.name)?.defs[0];
  if (def?.type === 'FunctionName') return def.node as Fn;
  const init = def?.type === 'Variable' ? (def.node.init as Node | null) : null;
  return isFn(init) ? init : undefined;
}

/** Calls `visit` on `node` and everything below it, except below nodes it returns false for. */
export function walk(context: Rule.RuleContext, node: Node, visit: (n: Node) => boolean): void {
  if (!visit(node)) return;
  for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
    const value: unknown = (node as unknown as Record<string, unknown>)[key];
    for (const child of Array.isArray(value) ? (value as unknown[]) : [value]) {
      if (typeof child === 'object' && child !== null && 'type' in child) {
        walk(context, child as Node, visit);
      }
    }
  }
}

const span = (node: Node): readonly [number, number] => node.range ?? [0, 0];

/** Whether `inner` lies within `outer` in the source. */
export const within = (outer: Node, inner: Node): boolean =>
  span(outer)[0] <= span(inner)[0] && span(inner)[1] <= span(outer)[1];

/** The nearest ancestor of `node` that is a key of `map`, and its value. */
export function enclosing<V>(node: Node, map: ReadonlyMap<Node, V>): V | undefined {
  for (let n: Node | null = node.parent; n !== null; n = n.parent) {
    const value = map.get(n);
    if (value !== undefined) return value;
  }
  return undefined;
}

const ROOTS = new Set(['shadowRoot', 'renderRoot']);

/**
 * Whether `node` is reached through a component's shadow or render root (`x.shadowRoot`,
 * `host.renderRoot.querySelector(s)`, or a local name for one): what focus(selector) searches.
 * A page lookup (`document.querySelector`) or an element the driver is handed is not (gyral-um2).
 */
export function inComponentRoot(context: Rule.RuleContext, node: Node, depth = 0): boolean {
  const n = unwrap(node);
  if (depth > 8) return false;
  if (n.type === 'MemberExpression') {
    const name = memberName(n);
    return (
      (name !== undefined && ROOTS.has(name)) ||
      inComponentRoot(context, n.object as Node, depth + 1)
    );
  }
  if (n.type === 'CallExpression') return inComponentRoot(context, n.callee as Node, depth + 1);
  if (n.type !== 'Identifier') return false;
  const def = findVariable(context.sourceCode.getScope(n), n.name)?.defs[0];
  const init = def?.type === 'Variable' ? (def.node.init as Node | null) : null;
  return init !== null && inComponentRoot(context, init, depth + 1);
}

const WINDOWS = new Set(['window', 'self', 'globalThis', 'top', 'parent', 'opener', 'frames']);
const OPEN = new Set(['open']);

/**
 * Whether `.focus()` on `node` focuses a window (a popup, a frame), which the command can't:
 * `window`, `frame.contentWindow`, `window.open(url)`, or a local name for one.
 */
export function isWindow(context: Rule.RuleContext, node: Node): boolean {
  const n = unwrap(node);
  if (n.type === 'Identifier') {
    if (WINDOWS.has(n.name)) return true;
    const def = findVariable(context.sourceCode.getScope(n), n.name)?.defs[0];
    const init = def?.type === 'Variable' ? (def.node.init as Node | null) : null;
    if (init === null) return false;
    return init.type === 'Identifier' ? WINDOWS.has(init.name) : isWindow(context, init);
  }
  const name = memberName(n);
  return (
    name === 'contentWindow' ||
    (name !== undefined && WINDOWS.has(name)) ||
    (n.type === 'CallExpression' && memberName(unwrap(n.callee as Node)) === 'open') ||
    (n.type === 'CallExpression' && isGlobal(context, unwrap(n.callee as Node), OPEN))
  );
}

/** Whether `node` reads the element's own attribute (`this.getAttribute`) or a prop. */
export function isAttributeOrProp(context: Rule.RuleContext, node: Node): boolean {
  const n = operand(node);
  if (n.type === 'CallExpression') {
    const callee = unwrap(n.callee as Node);
    return (
      memberName(callee) === 'getAttribute' &&
      callee.type === 'MemberExpression' &&
      unwrap(callee.object as Node).type === 'ThisExpression'
    );
  }
  if (n.type === 'Identifier') {
    // attributeChangedCallback(name, old, value) { JSON.parse(value) }
    const def = findVariable(context.sourceCode.getScope(n), n.name)?.defs[0];
    const fn = def?.type === 'Parameter' ? (def.node as Node) : undefined;
    const method = fn?.parent;
    return (
      method?.type === 'MethodDefinition' &&
      keyOf(method.key as Node) === 'attributeChangedCallback' &&
      isFn(fn) &&
      fn.params[2] === def?.name
    );
  }
  if (n.type !== 'MemberExpression') return false;
  const object = unwrap(n.object as Node);
  if (memberName(object) === 'dataset' && object.type === 'MemberExpression') {
    return unwrap(object.object as Node).type === 'ThisExpression';
  }
  return (
    (object.type === 'Identifier' && object.name === 'props') || memberName(object) === 'props'
  );
}

const keyOf = (key: Node): string | undefined => (key.type === 'Identifier' ? key.name : undefined);

const EQUALITY = new Set(['===', '!==', '==', '!=']);

export interface Subscription {
  readonly fn: Fn;
  readonly emits: readonly Node[];
}

/** Whether `test` compares something with a value the subscription remembers (reassigns). */
export function comparesRemembered(
  context: Rule.RuleContext,
  test: Node,
  assigned: ReadonlySet<string>,
) {
  const constant = (o: Node): boolean => {
    const n = unwrap(o);
    return (
      n.type === 'Literal' ||
      (n.type === 'Identifier' && n.name === 'undefined') ||
      n.type === 'UnaryExpression' ||
      (n.type === 'TemplateLiteral' && n.expressions.length === 0)
    );
  };
  const remembered = (o: Node): boolean => {
    let found = false;
    walk(context, o, (n) => {
      if (found || isFn(n)) return false;
      if (n.type === 'MemberExpression' && assigned.has(context.sourceCode.getText(n)))
        found = true;
      const p = n.parent;
      const key =
        (p?.type === 'MemberExpression' && p.property === n && !p.computed) ||
        (p?.type === 'Property' && p.key === n);
      if (n.type === 'Identifier' && !key) {
        const v = findVariable(context.sourceCode.getScope(n), n.name);
        found = (v?.references ?? []).some((r) => r.isWrite() && !r.init);
      }
      return !found;
    });
    return found;
  };
  let found = false;
  walk(context, test, (n) => {
    if (found || isFn(n)) return false;
    const operands =
      n.type === 'BinaryExpression' && EQUALITY.has(n.operator)
        ? [n.left as Node, n.right as Node]
        : n.type === 'CallExpression' && context.sourceCode.getText(n.callee) === 'Object.is'
          ? (n.arguments as Node[]).slice(0, 2)
          : undefined;
    found =
      operands !== undefined &&
      operands.length === 2 &&
      !operands.some(constant) &&
      operands.some(remembered);
    return !found;
  });
  return found;
}

/** Whether the `if` guards an emit: one in a branch, or after a branch that returns. */
export function guardsEmit(stmt: NodeOf<'IfStatement'>, emits: readonly Node[]): boolean {
  const branches = [stmt.consequent, stmt.alternate].filter(
    (b) => b !== null && b !== undefined,
  ) as Node[];
  if (emits.some((e) => branches.some((b) => within(b, e)))) return true;
  const exits = (s: Node): boolean =>
    s.type === 'ReturnStatement' ||
    s.type === 'ContinueStatement' ||
    s.type === 'BreakStatement' ||
    (s.type === 'BlockStatement' && s.body.length > 0 && exits(s.body[s.body.length - 1] as Node));
  const parent = stmt.parent;
  const body =
    parent.type === 'BlockStatement'
      ? (parent.body as Node[])
      : parent.type === 'SwitchCase'
        ? (parent.consequent as Node[])
        : [];
  const after = body.slice(body.indexOf(stmt) + 1);
  return exits(stmt.consequent as Node) && emits.some((e) => after.some((s) => within(s, e)));
}

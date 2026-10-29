// gyral/prefer-built-in, intent parsers (gyral-337.4, ADR 0001 "typed intent input"): what a
// plain parser digs out of the event by hand that `on(event, [filter], parser)` hands it typed.
// A plain parser is a function in the `intent` of `define()(tag, { intent })` (inline or a
// module binding), or one passed to `form()`/`field()` there; `on()` parsers are left alone.
// - onEvent: `instanceof KeyboardEvent` (MouseEvent, PointerEvent, DragEvent, InputEvent), or
//   `event.type` compared with a name, where `event` is the input's.
// - onModifiers: `ctrlKey`, `shiftKey`, `altKey` or `metaKey` read in the parser.
// - onNumber: `Number`, `parseInt`, `parseFloat` or unary `+` of the input's `value`, only when
//   every element that binds the intent in the module is a number, range, date or time
//   `<input>`: `valueAsNumber` is `undefined` for anything else (a button's or select's value).
// - onOrigin: `composedPath()[0]` (or `.at(0)`).
// An `on()` parser handles one event, so a parser that handles several is skipped: bound to two
// events in the module's templates (or to a `data-intent-on` it can't read), comparing
// `event.type` with two names, or reading `event.type` any other way (`switch`, `includes`).
import type { Rule, Scope } from 'eslint';
import { findVariable, isGyral, type Node, type NodeOf } from './imports.js';
import { intentName, triggers } from './intent-event-rule.js';
import {
  enclosing,
  isGlobal,
  keyName,
  localFunction,
  memberName,
  operand,
  property,
  unwrap,
  type Fn,
} from './prefer-built-in-shapes.js';

export interface Parser {
  readonly fn: Fn;
  /** The intents it parses (one function may serve several). */
  readonly names: Set<string>;
  /** Whether its first parameter is the intent input (a form() callback gets data instead). */
  readonly takesInput: boolean;
  /** That parameter's variable, when it is a plain name (`(input) => …`). */
  readonly input: Scope.Variable | undefined;
}

/** Adds the plain parsers of a `define()(tag, spec)` spec to `parsers`. */
export function collectParsers(
  context: Rule.RuleContext,
  spec: Node,
  parsers: Map<Node, Parser>,
): void {
  const intent = property(spec, 'intent');
  if (intent?.type !== 'ObjectExpression') return;
  for (const p of intent.properties) {
    const name = p.type === 'Property' && !p.computed ? keyName(p.key as Node) : undefined;
    if (p.type !== 'Property' || name === undefined) continue;
    const add = (fn: Fn | undefined, takesInput: boolean): void => {
      if (fn === undefined) return;
      const param = fn.params[0] as Node | undefined;
      const input =
        takesInput && param?.type === 'Identifier'
          ? context.sourceCode.getDeclaredVariables(fn).find((v) => v.name === param.name)
          : undefined;
      const parser = parsers.get(fn) ?? { fn, names: new Set<string>(), takesInput, input };
      parser.names.add(name);
      parsers.set(fn, parser);
    };
    const value = p.value as Node;
    if (value.type !== 'CallExpression') add(localFunction(context, value), true);
    else if (
      isGyral(context, value.callee as Node, 'form') ||
      isGyral(context, value.callee as Node, 'field')
    ) {
      for (const arg of value.arguments) add(localFunction(context, arg as Node), false);
    }
  }
}

const isInput = (context: Rule.RuleContext, parser: Parser, node: Node): boolean =>
  node.type === 'Identifier' &&
  parser.input !== undefined &&
  findVariable(context.sourceCode.getScope(node), node.name) === parser.input;

/** The key `name` is bound under at the top of the object pattern `pattern` (`{ key: name }`). */
function keyIn(name: Node, pattern: Node | undefined): string | undefined {
  const value = name.parent?.type === 'AssignmentPattern' ? name.parent : name; // `{ value = '' }`
  const p = value.parent;
  return p?.type === 'Property' && p.value === value && p.parent === pattern && !p.computed
    ? keyName(p.key as Node)
    : undefined;
}

/** The field of the parser's input that `node` reads: `input.event`, `({ value })`, an alias. */
export function inputField(
  context: Rule.RuleContext,
  parser: Parser,
  node: Node,
): string | undefined {
  if (!parser.takesInput) return undefined;
  const n = unwrap(node);
  if (n.type === 'MemberExpression') {
    return isInput(context, parser, unwrap(n.object as Node)) ? memberName(n) : undefined;
  }
  if (n.type !== 'Identifier') return undefined;
  const def = findVariable(context.sourceCode.getScope(n), n.name)?.defs[0];
  if (def?.type === 'Parameter') {
    return def.node === parser.fn
      ? keyIn(def.name as Node, parser.fn.params[0] as Node)
      : undefined;
  }
  if (def?.type !== 'Variable' || def.node.init === null || def.node.init === undefined) {
    return undefined;
  }
  const init = unwrap(def.node.init as Node);
  if (def.node.id.type === 'ObjectPattern') {
    return isInput(context, parser, init)
      ? keyIn(def.name as Node, def.node.id as Node)
      : undefined;
  }
  return init.type === 'MemberExpression' ? inputField(context, parser, init) : undefined; // `const e = input.event`
}

export interface Binding {
  readonly name: string;
  /** The start tag of the element that binds it (holes as U+E000). */
  readonly tag: string;
  /** The events that fire it there; undefined when unknown (a bound data-intent-on). */
  readonly events: readonly string[] | undefined;
}

const HOLE = '';

/** The intents a Gyral template binds by `data-intent=${…}` or `data-intent-<event>=${…}`. */
export function bindingsIn(node: NodeOf<'TaggedTemplateExpression'>): Binding[] {
  const { quasis, expressions } = node.quasi;
  const text = quasis.map((q) => q.value.cooked ?? '').join(HOLE);
  let at = -1;
  return expressions.flatMap((expression, k) => {
    at = text.indexOf(HOLE, at + 1);
    const name = intentName(expression as Node);
    const own = /\sdata-intent(?:-([\w-]+))?=["']?$/.exec(quasis[k]?.value.cooked ?? '');
    if (name === undefined || own === null || own[1] === 'on') return [];
    const end = text.indexOf('>', at);
    const tag = text.slice(text.lastIndexOf('<', at), end === -1 ? undefined : end + 1);
    return [{ name, tag, events: own[1] === undefined ? triggers(tag) : [own[1]] }];
  });
}

export interface Candidate {
  readonly kind: 'instanceof' | 'type' | 'modifier' | 'number' | 'origin';
  readonly node: Node;
  /** What it reads: the event of `event.type`, the value of `Number(value)`. */
  readonly of?: Node;
}

const EVENT_CLASSES = new Set([
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'DragEvent',
  'InputEvent',
]);
const MODIFIERS = new Set(['ctrlKey', 'shiftKey', 'altKey', 'metaKey']);
const TO_NUMBER = new Set(['Number', 'parseInt', 'parseFloat']);
const NUMBER = new Set(['Number']);
const NUMERIC = /^(number|range|date|time|datetime-local|month|week)$/i;

const isComposedPath = (node: Node): boolean => {
  const n = unwrap(node);
  return n.type === 'CallExpression' && memberName(unwrap(n.callee as Node)) === 'composedPath';
};

/** What `node` would be in a parser, before knowing whether it is in one. */
export function candidate(context: Rule.RuleContext, node: Node): Candidate | undefined {
  if (node.type === 'BinaryExpression') {
    const isEvent =
      node.operator === 'instanceof' && isGlobal(context, node.right as Node, EVENT_CLASSES);
    return isEvent ? { kind: 'instanceof', node } : undefined;
  }
  if (node.type === 'UnaryExpression') {
    return node.operator === '+' ? { kind: 'number', node, of: node.argument as Node } : undefined;
  }
  if (node.type === 'Property') {
    const destructured = node.parent.type === 'ObjectPattern' && !node.computed;
    return destructured && MODIFIERS.has(keyName(node.key as Node) ?? '')
      ? { kind: 'modifier', node }
      : undefined;
  }
  if (node.type === 'CallExpression') {
    const callee = unwrap(node.callee as Node);
    const arg = node.arguments[0] as Node | undefined;
    const toNumber =
      isGlobal(context, callee, TO_NUMBER) ||
      (callee.type === 'MemberExpression' &&
        isGlobal(context, unwrap(callee.object as Node), NUMBER) &&
        /^parse(Int|Float)$/.test(memberName(callee) ?? ''));
    if (toNumber && arg !== undefined) return { kind: 'number', node, of: arg };
    const first = arg?.type === 'Literal' && arg.value === 0 && memberName(callee) === 'at';
    return first && callee.type === 'MemberExpression' && isComposedPath(callee.object as Node)
      ? { kind: 'origin', node }
      : undefined;
  }
  if (node.type !== 'MemberExpression') return undefined;
  const name = memberName(node);
  if (name === 'type') return { kind: 'type', node, of: node.object as Node };
  if (name !== undefined && MODIFIERS.has(name)) return { kind: 'modifier', node };
  const property = node.property as Node;
  const first = node.computed && property.type === 'Literal' && property.value === 0;
  return first && isComposedPath(node.object as Node) ? { kind: 'origin', node } : undefined;
}

/** The name `event.type` is compared with (`=== 'keydown'`), or undefined for any other use. */
function comparedWith(member: Node): string | undefined {
  const p = member.parent;
  if (p?.type !== 'BinaryExpression' || !['===', '!==', '==', '!='].includes(p.operator))
    return undefined;
  const other = (p.left === member ? p.right : p.left) as Node;
  return other.type === 'Literal' && typeof other.value === 'string' ? other.value : undefined;
}

export interface ParserReport {
  readonly node: Node;
  readonly messageId: 'onEvent' | 'onModifiers' | 'onNumber' | 'onOrigin';
  readonly event: string;
}

/** The on() reports for `candidates` that sit in parsers handling one event. */
export function parserReports(
  context: Rule.RuleContext,
  parsers: ReadonlyMap<Node, Parser>,
  candidates: readonly Candidate[],
  bindings: readonly Binding[],
): ParserReport[] {
  const byParser = new Map<Parser, Candidate[]>();
  for (const c of candidates) {
    const parser = enclosing(c.node, parsers);
    if (parser !== undefined) byParser.set(parser, [...(byParser.get(parser) ?? []), c]);
  }
  return [...byParser].flatMap(([parser, found]) => {
    const own = bindings.filter((b) => parser.names.has(b.name));
    if (own.some((b) => b.events === undefined)) return [];
    const events = new Set(own.flatMap((b) => b.events ?? []));
    const types = found.filter(
      (c) =>
        c.kind === 'type' && c.of !== undefined && inputField(context, parser, c.of) === 'event',
    );
    for (const t of types) events.add(comparedWith(t.node) ?? '\0'); // '\0': read some other way
    if (events.size > 1 || events.has('\0')) return [];
    const event = [...events][0] ?? '<event>';
    const numeric =
      own.length > 0 &&
      own.every(
        (b) =>
          /^<input\b/i.test(b.tag) &&
          NUMERIC.test(/\stype=["']?([^"'\s>]*)/i.exec(b.tag)?.[1] ?? ''),
      );
    const pick = (messageId: ParserReport['messageId'], test: (c: Candidate) => boolean) => {
      const c = found.find(test);
      return c === undefined ? [] : [{ node: c.node, messageId, event }];
    };
    return [
      ...pick('onEvent', (c) => c.kind === 'instanceof' || types.includes(c)),
      ...pick('onModifiers', (c) => c.kind === 'modifier'),
      ...pick(
        'onNumber',
        (c) =>
          numeric &&
          c.kind === 'number' &&
          c.of !== undefined &&
          inputField(context, parser, operand(c.of)) === 'value',
      ),
      ...pick('onOrigin', (c) => c.kind === 'origin'),
    ];
  });
}

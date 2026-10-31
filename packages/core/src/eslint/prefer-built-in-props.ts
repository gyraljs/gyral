// gyral/prefer-built-in, jsonProp (gyral-bt4): where a `define()(tag, spec)` spec's functions
// take the props, found by position rather than by name. `init(props)` and
// `subscriptions(state, props)` take the props; `view(state, intents, ctx)`, each reducer
// `(state, msg, ctx)`, each intent parser `(input, ctx)` (plain or `on()`'s) and
// `formAssociated`'s `value`, `state` and `validity` `(state, ctx)` take the context, whose
// `props` are the props. A props parameter may have any name (`(p) => p.a`) or be destructured
// (`({ a }) => a`, `{ props: { a } }`); a field inside one prop (`{ config: { raw } }`) is that
// prop's data, not an attribute. `ctx.props.x` and `props.x` are matched by name, as before.
import type { Rule } from 'eslint';
import { isGyral, type Node } from './imports.js';
import {
  keyName,
  localFunction,
  property,
  type Fn,
  type PropParams,
} from './prefer-built-in-shapes.js';

/** Adds the props parameters of a `define()(tag, spec)` spec's functions to `params`. */
export function collectPropParams(context: Rule.RuleContext, spec: Node, params: PropParams): void {
  const at = (fn: Fn | undefined, index: number): Node | undefined =>
    fn?.params[index] as Node | undefined;
  const fn = (node: Node | undefined): Fn | undefined => localFunction(context, node);
  addProps(at(fn(property(spec, 'init')), 0), params);
  addProps(at(fn(property(spec, 'subscriptions')), 1), params);
  addCtx(at(fn(property(spec, 'view')), 2), params);
  for (const reducer of values(property(spec, 'update'))) addCtx(at(fn(reducer), 2), params);
  for (const parser of values(property(spec, 'intent'))) {
    const on =
      parser.type === 'CallExpression' && isGyral(context, parser.callee as Node, 'on')
        ? (parser.arguments.at(-1) as Node | undefined)
        : parser;
    addCtx(at(fn(on), 1), params);
  }
  for (const projection of values(property(spec, 'formAssociated'))) {
    addCtx(at(fn(projection), 1), params);
  }
}

/** The property values of an object literal (not spreads). */
const values = (object: Node | undefined): Node[] =>
  object?.type === 'ObjectExpression'
    ? object.properties.flatMap((p) => (p.type === 'Property' ? [p.value as Node] : []))
    : [];

/** `pattern` without a default (`p = {}`). */
const undefaulted = (pattern: Node): Node =>
  pattern.type === 'AssignmentPattern' ? (pattern.left as Node) : pattern;

/** A props parameter: a bag (`p`, `...rest`) or destructured props (`{ a, b: c = '' }`). */
function addProps(param: Node | undefined, params: PropParams): void {
  const p = param === undefined ? undefined : undefaulted(param);
  if (p?.type === 'Identifier') params.bags.add(p);
  if (p?.type !== 'ObjectPattern') return;
  for (const field of p.properties) {
    const target = undefaulted(
      (field.type === 'RestElement' ? field.argument : field.value) as Node,
    );
    if (target.type !== 'Identifier') continue; // a field inside one prop
    (field.type === 'RestElement' ? params.bags : params.values).add(target);
  }
}

/** A context parameter: its `props`, when destructured (`{ props }`, `{ props: { a } }`). */
function addCtx(param: Node | undefined, params: PropParams): void {
  const p = param === undefined ? undefined : undefaulted(param);
  if (p?.type !== 'ObjectPattern') return; // `ctx.props.x` is matched by name
  for (const field of p.properties) {
    if (field.type === 'Property' && !field.computed && keyName(field.key as Node) === 'props') {
      addProps(field.value as Node, params);
    }
  }
}

// gyral/intent-event (gyral-337.6): an intent whose parser is `on('keydown', …)` must be bound to
// that event. The rule reads each `define()(tag, { intent })` in the module for `on()` parsers,
// then every html or svg template for the elements that name those intents: `data-intent-<event>`
// names the event, `data-intent` fires on its static `data-intent-on` list or on the element's
// default trigger (intent.ts `defaultTrigger`: submit for a form, change for a select, checkbox
// or radio, input for a textarea or text-like input, click otherwise). Development throws G0018
// at run time for the same mistake; this finds it in the editor. Bindings it can't read (a bound
// data-intent-on, a spread) are skipped.
import type { Rule } from 'eslint';
import { isGyral, OPTIONS_SCHEMA, type Node } from './imports.js';

const HOLE = '\uE000';

/** The intent name a hole's expression names: `i.Name`, `i['Name']` or `'Name'`. */
export function intentName(expression: Node | undefined): string | undefined {
  if (expression?.type === 'Literal' && typeof expression.value === 'string')
    return expression.value;
  if (expression?.type !== 'MemberExpression') return undefined;
  const property = expression.property as Node;
  if (!expression.computed && property.type === 'Identifier') return property.name;
  return property.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : undefined;
}

/** A static attribute's value; a quoted one runs to its closing quote (`data-intent-on="a b"`). */
function attribute(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)'|([^"'\\s>]*))`, 'i').exec(tag);
  return m === null ? undefined : (m[1] ?? m[2] ?? m[3]);
}

/** The events that fire `data-intent` on the element `tag` (its source text), or undefined. */
export function triggers(tag: string): readonly string[] | undefined {
  const on = attribute(tag, 'data-intent-on');
  if (on?.includes(HOLE) === true) return undefined; // bound, in whole or part: unknown here
  if (on !== undefined) return on.split(/\s+/).filter(Boolean);
  const name = /^<([\w-]+)/.exec(tag)?.[1]?.toLowerCase() ?? '';
  const type = (attribute(tag, 'type') ?? '').toLowerCase();
  if (name === 'form') return ['submit'];
  if (name === 'select' || (name === 'input' && /^(checkbox|radio)$/.test(type))) return ['change'];
  if (name === 'textarea' || (name === 'input' && !/^(button|submit|reset|image)$/.test(type))) {
    return ['input'];
  }
  return [name.includes('-') ? 'gyral-output' : 'click'];
}

export const intentEventRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "An intent whose parser is on('event', …) bound to another event: the parser never " +
        'parses it (development throws G0018).',
      recommended: true,
      url: 'https://gyral.dev/errors/#G0018',
    },
    schema: OPTIONS_SCHEMA,
    messages: {
      other:
        'The intent "{{name}}" is on("{{expected}}"), but this element fires it on ' +
        '{{actual}}: bind it with data-intent-{{expected}}=${i.{{name}}}, or give it a parser ' +
        'of its own (G0018).',
    },
  },
  create(context) {
    const expected = new Map<string, string | null>(); // null: two components disagree
    const bindings: { name: string; events: readonly string[]; node: Node }[] = [];
    return {
      CallExpression(node) {
        const callee = node.callee as Node;
        if (
          callee.type !== 'CallExpression' ||
          !isGyral(context, callee.callee as Node, 'define')
        ) {
          return;
        }
        const spec = node.arguments[1] as Node | undefined;
        if (spec?.type !== 'ObjectExpression') return;
        const intent = spec.properties.find(
          (p) =>
            p.type === 'Property' &&
            !p.computed &&
            p.key.type === 'Identifier' &&
            p.key.name === 'intent',
        );
        const value = intent?.type === 'Property' ? (intent.value as Node) : undefined;
        if (value?.type !== 'ObjectExpression') return;
        for (const p of value.properties) {
          if (p.type !== 'Property' || p.computed || p.key.type !== 'Identifier') continue;
          const call = p.value as Node;
          if (call.type !== 'CallExpression' || !isGyral(context, call.callee as Node, 'on'))
            continue;
          const event = call.arguments[0] as Node | undefined;
          if (event?.type !== 'Literal' || typeof event.value !== 'string') continue;
          const before = expected.get(p.key.name);
          expected.set(
            p.key.name,
            before === undefined || before === event.value ? event.value : null,
          );
        }
      },
      TaggedTemplateExpression(node) {
        const tag = node.tag as Node;
        if (!isGyral(context, tag, 'html') && !isGyral(context, tag, 'svg')) return;
        const { quasis, expressions } = node.quasi;
        const text = quasis.map((q) => q.value.cooked ?? '').join(HOLE);
        let at = -1;
        expressions.forEach((expression, k) => {
          at = text.indexOf(HOLE, at + 1);
          const name = intentName(expression as Node);
          const before = quasis[k]?.value.cooked ?? '';
          const own = /\sdata-intent(?:-([\w-]+))?=["']?$/.exec(before);
          if (name === undefined || own === null || own[1] === 'on') return;
          if (own[1] !== undefined) {
            bindings.push({ name, events: [own[1]], node: expression as Node });
            return;
          }
          const start = text.lastIndexOf('<', at);
          const end = text.indexOf('>', at);
          const events = triggers(text.slice(start, end === -1 ? undefined : end + 1));
          if (events !== undefined) bindings.push({ name, events, node: expression as Node });
        });
      },
      'Program:exit'() {
        for (const { name, events, node } of bindings) {
          const want = expected.get(name);
          if (typeof want !== 'string' || events.includes(want)) continue;
          const actual = events.map((e) => `"${e}"`).join(' or ');
          context.report({ node, messageId: 'other', data: { name, expected: want, actual } });
        }
      },
    };
  },
};

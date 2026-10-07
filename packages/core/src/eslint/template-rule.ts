// gyral/template: the template rules of view/09-template-rules.md, in the editor. Every html`…`
// (and svg`…`) whose tag is imported from a template source goes through the normalizer's own check
// (view/normalize/check.ts), the one rule set the compiler and the development runtime use, so
// the message is the same TemplateError message (minus the `near:`/`at` context, which the
// editor's location replaces). Not checked here: rule 7's parse5 comparison (compiler only) and
// the browser's own parse (runtime only); rule 11 (a page shell is fine on the server).
import type { Rule } from 'eslint';
import { checkTemplate, TemplateError } from '../view/index.js';
import { isGyral, OPTIONS_SCHEMA } from './imports.js';
import { cookedMap, errorSpan, type Quasi } from './locate.js';

/** The message ESLint shows: the TemplateError's first line (rule, fix and spec section). */
export const messageOf = (error: TemplateError): string => error.message.split('\n')[0] ?? '';

const INVALID_ESCAPE =
  'This template has an invalid escape sequence, so it has no string value at runtime. ' +
  'Fix the escape (write \\\\ for a backslash).';

/** What this rule reads of a TemplateElement (ESTree's, or typescript-eslint's). */
interface QuasiNode {
  readonly value: { readonly cooked?: string | null | undefined };
  readonly range?: [number, number] | undefined;
  readonly tail: boolean;
}

function quasisOf(
  context: Rule.RuleContext,
  node: { readonly quasis: readonly QuasiNode[] },
): { quasis: Quasi[]; cooked: string[] } | undefined {
  const text = context.sourceCode.text;
  const quasis: Quasi[] = [];
  const cooked: string[] = [];
  for (const q of node.quasis) {
    const value = q.value.cooked;
    if (typeof value !== 'string') return undefined;
    const [from, to] = q.range ?? [0, 0];
    // Parsers include the delimiters (` or } before, ` or ${ after) in the element's range.
    const start = text.charAt(from) === '`' || text.charAt(from) === '}' ? from + 1 : from;
    const end = q.tail ? to - 1 : to - 2;
    // Undecodable (it shouldn't be): point at the quasi's start.
    const map = cookedMap(text.slice(start, end), value) ?? Array<number>(value.length + 1).fill(0);
    quasis.push({ start, end, map });
    cooked.push(value);
  }
  return { quasis, cooked };
}

export const templateRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Template rules for html`…` and svg`…` (view/09-template-rules.md): the same checks and messages ' +
        'as the template compiler and the development runtime.',
      recommended: true,
      url: 'https://github.com/gyraljs/gyral/blob/main/docs/design-docs/view/09-template-rules.md',
    },
    schema: OPTIONS_SCHEMA,
    messages: { rule: '{{message}}', escape: INVALID_ESCAPE },
  },
  create(context) {
    return {
      TaggedTemplateExpression(node) {
        const tag = node.tag as Rule.Node;
        const svg = isGyral(context, tag, 'svg');
        if (!svg && !isGyral(context, tag, 'html')) return;
        const parts = quasisOf(context, node.quasi);
        if (parts === undefined) {
          context.report({ node: node.quasi, messageId: 'escape' });
          return;
        }
        const issue = checkTemplate(parts.cooked, svg);
        if (issue === undefined) return;
        const span = errorSpan(parts.quasis, parts.cooked, issue.strings, issue.at, issue.from);
        const { sourceCode } = context;
        context.report({
          loc: {
            start: sourceCode.getLocFromIndex(span.start),
            end: sourceCode.getLocFromIndex(Math.max(span.end, span.start)),
          },
          messageId: 'rule',
          data: { message: messageOf(issue.error) },
        });
      },
    };
  },
};

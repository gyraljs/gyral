// One rule set, three places (view/09-template-rules.md): checkTemplate (what the ESLint plugin
// runs) finds exactly what normalize() (the compiler's and the runtime's path) finds, and
// gyral/template shows the runtime's TemplateError message for the same strings.
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import gyral from '../../src/eslint/index.js';
import { checkTemplate, normalize, TemplateError } from '../../src/view/index.js';
import { corpus } from '../view/corpus.js';
import { runtimeMessage } from './helpers.js';

/** Bad templates, one or more per rule the normalizer checks (holes written as ${x}). */
const BAD = [
  '<button @click=${x}></button>',
  '<button @click="a${x}"></button>',
  '<${x}></p>',
  '<p data-${x}="y"></p>',
  '<script>let a = ${x}</script>',
  '<!doctype ${x}>',
  '<template><p class=${x}></p></template>',
  '<input .value=${x}>',
  '<textarea .value=${x}></textarea>',
  '<b class=${x}a></b>',
  '<b .p="${x}${x}"></b>',
  '<my-el />',
  '<table><td></td></table>',
  '<ul><li><div><li></li></div></li></ul>',
  '<svg><div></div></svg>',
  '<p>a</br></p>',
  '<a href=${x}',
  '<p>${x}<!-- x',
  '<div><path d=${x}></path></div>',
  '<textarea>a ${x}</textarea>',
  '<my-el label="&hellip;"></my-el>',
];

const stringsOf = (body: string): string[] => body.split('${x}');

function runtimeError(strings: readonly string[]): TemplateError | undefined {
  try {
    normalize(strings);
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  return undefined;
}

describe('one rule set (view/09)', () => {
  it('checkTemplate throws nothing the runtime accepts: the whole template corpus', () => {
    expect(corpus.length).toBeGreaterThan(50);
    for (const { file, strings } of corpus) {
      expect(runtimeError(strings), file).toBeUndefined();
      expect(checkTemplate(strings), file).toBeUndefined();
    }
  });

  it('checkTemplate finds the same first error as normalize', () => {
    const rules = new Set<number>();
    for (const body of BAD) {
      const expected = runtimeError(stringsOf(body));
      const issue = checkTemplate(stringsOf(body));
      expect(expected, body).toBeDefined();
      expect(issue?.error.rule, body).toBe(expected?.rule);
      expect(issue?.error.message, body).toBe(expected?.message);
      rules.add(expected?.rule ?? 0);
    }
    expect([...rules].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 12, 13]);
  });

  it("gyral/template's message is the runtime TemplateError's, minus the near/at context", () => {
    const linter = new Linter();
    for (const body of BAD) {
      const code = `import { html } from '@gyral/core';\nexport const v = (x) => html\`${body}\`;\n`;
      const messages = linter.verify(code, [gyral.configs.recommended]);
      expect(
        messages.map((m) => m.message),
        body,
      ).toEqual([runtimeMessage(stringsOf(body))]);
      expect(runtimeError(stringsOf(body))?.message.startsWith(messages[0]?.message ?? '-')).toBe(
        true,
      );
    }
  });
});

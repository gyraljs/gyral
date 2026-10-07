// Shared by the @gyral/core/eslint tests: ESLint's RuleTester on Vitest, and expectations built
// from the runtime's own TemplateError (so the plugin's messages are checked against it).
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import { normalize, TemplateError } from '../../src/view/index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
});

/** For TypeScript syntax (type annotations, `import type`). */
export const tsTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

/** The message the runtime throws for these strings, without the near/at context. */
export function runtimeMessage(strings: readonly string[]): string {
  try {
    normalize(strings);
  } catch (error) {
    if (error instanceof TemplateError) return error.message.split('\n')[0] ?? '';
    throw error;
  }
  throw new Error(`expected a TemplateError for ${JSON.stringify(strings)}`);
}

/** 1-based line and column of `index` in `code`, as ESLint reports them. */
export function position(code: string, index: number): { line: number; column: number } {
  const before = code.slice(0, index).split(/\r\n|\r|\n/);
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

/** The error location of the `n`th (0-based) occurrence of `text` in `code`. */
export function spanOf(
  code: string,
  text: string,
  n = 0,
): { line: number; column: number; endLine: number; endColumn: number } {
  let at = -1;
  for (let k = 0; k <= n; k++) at = code.indexOf(text, at + 1);
  if (at < 0) throw new Error(`${text} is not in ${code}`);
  const start = position(code, at);
  const end = position(code, at + text.length);
  return { ...start, endLine: end.line, endColumn: end.column };
}

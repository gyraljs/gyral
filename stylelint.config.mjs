// CSS follows the same Baseline policy as JS (docs/design-docs/0003-browser-baseline.md):
// widely available features only, newer ones inside @supports as progressive enhancement.
// postcss-lit reads the css`` templates in TypeScript components.
/** @type {import('stylelint').Config} */
export default {
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    'plugin/use-baseline': [
      true,
      {
        available: 'widely',
        // At-rules that can't be guarded by @supports, and that older browsers ignore as a
        // whole block (so the baseline experience is unchanged). Each is listed in ADR 0003.
        ignoreAtRules: ['starting-style'],
      },
    ],
  },
  overrides: [{ files: ['**/*.ts'], customSyntax: 'postcss-lit' }],
  ignoreFiles: ['**/node_modules/**', '**/dist/**', 'archive/**', '.claude/worktrees/**'],
};

// Lint rules double as agent guardrails: every restriction message says how to fix it.
// See docs/design-docs/core-beliefs.md ("Enforce invariants, not implementations").
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';
import globals from 'globals';

const EFFECT_BOUNDARY =
  'Effect is an internal implementation detail (docs/design-docs/0002-effect-boundary.md). ' +
  'Move this code under packages/<pkg>/src/internal/ and expose a plain TypeScript API from it.';

const effectImports = {
  paths: [{ name: 'effect', message: EFFECT_BOUNDARY }],
  patterns: [{ group: ['effect/*', '@effect/*'], message: EFFECT_BOUNDARY }],
};

export default tseslint.config(
  { ignores: ['archive/**', '.beads/**', '.pnpm-store/**', '**/dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': ['error', effectImports],
    },
  },
  {
    // Layer 0: @gyral/core may not depend on any other Gyral package (ARCHITECTURE.md).
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/internal/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            {
              group: ['@gyral/*'],
              message:
                '@gyral/core is the bottom layer and must not import other Gyral packages (ARCHITECTURE.md). Invert the dependency.',
            },
          ],
        },
      ],
    },
  },
  {
    // Internal modules are the only place Effect is allowed.
    files: ['packages/*/src/internal/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Shipped browser code must respect the Baseline policy in .browserslistrc.
    files: ['packages/*/src/**/*.ts', 'examples/*/src/**/*.ts'],
    plugins: { compat },
    languageOptions: { globals: globals.browser },
    rules: { 'compat/compat': 'error' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);

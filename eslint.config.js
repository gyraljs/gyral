// Lint rules double as agent guardrails: every restriction message says how to fix it.
// See docs/design-docs/core-beliefs.md ("Enforce invariants, not implementations").
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';
import globals from 'globals';

const EFFECT_BOUNDARY =
  'Gyral has no Effect dependency since 0.2.0 (docs/design-docs/0015-runtime-size-spike.md). ' +
  'Write it in plain TypeScript (Promise, AbortSignal, tagged unions); Effect integration ' +
  'belongs in an optional adapter package such as @gyral/effect, not in src/internal/.';

const VIEW_BOUNDARY =
  'packages/core/src/view/ is self-contained (ADR 0018 "Where it lives"): it imports nothing ' +
  'from the rest of core, so it can become @gyral/view later. Move what you need into view/, ' +
  'or have the caller pass it in; code outside view/ imports view/index.ts.';

const VIEW_SERVER_BOUNDARY =
  'view/server/ may import only view/ (ADR 0018): the server renderer must never pull browser ' +
  'or element code into a server bundle. Move shared code into view/.';

const VIEW_CLEAN_ROOM =
  "The view layer replaces Lit and is written clean-room (ADR 0018, decision J): don't import " +
  'lit, lit-html, lit-element, @lit/* or @lit-labs/* in view/. Implement it from ' +
  'docs/design-docs/view/ and the web-platform specs.';

const effectImports = {
  paths: [{ name: 'effect', message: EFFECT_BOUNDARY }],
  patterns: [{ group: ['effect/*', '@effect/*'], message: EFFECT_BOUNDARY }],
};

export default tseslint.config(
  {
    ignores: [
      'archive/**',
      '.beads/**',
      '.pnpm-store/**',
      '.claude/worktrees/**',
      '**/dist/**',
      // App templates are type-checked and linted as generated apps by `pnpm verify:create`.
      'packages/create-gyral/templates/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': [
        'error',
        {
          // Lit SSR serializes `.checked=${false}` as checked="false", which checks the box.
          selector:
            'TaggedTemplateExpression[tag.name=/^(html|serverHtml)$/] TemplateElement[value.raw=/\\.(checked|selected|open|indeterminate|defaultChecked)=$/]',
          message:
            'Bind boolean form state with ?checked=${liveBoolean(x)} (from @gyral/core), not a .checked property binding: server rendering turns .checked=${false} into checked="false" (docs/design-docs/0012-ssr.md).',
        },
      ],
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
  // The view layer (ADR 0018 "Where it lives", "Clean room"): view/ imports nothing else from
  // core (its own `#prepare`/`#view-dev` conditions aside) and no Lit package; view/server/
  // imports only view/. Relative imports are matched by
  // depth, so each level gets the pattern that would climb out of view/.
  ...[
    ['packages/core/src/view/*.ts', '^\\.\\./'],
    ['packages/core/src/view/*/*.ts', '^\\.\\./\\.\\./'],
    ['packages/core/src/view/*/*/*.ts', '^\\.\\./\\.\\./\\.\\./'],
  ].map(([files, escape]) => ({
    files: [files],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            { group: ['@gyral/*'], message: VIEW_BOUNDARY },
            { regex: escape, message: VIEW_BOUNDARY },
            { regex: '^#(?!(prepare|view-dev)$)', message: VIEW_BOUNDARY },
            { regex: '^(@lit(-[a-z]+)?/|lit($|/|-))', message: VIEW_CLEAN_ROOM },
          ],
        },
      ],
    },
  })),
  {
    files: ['packages/core/src/view/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            { group: ['@gyral/*'], message: VIEW_SERVER_BOUNDARY },
            { regex: '^\\.\\./\\.\\./', message: VIEW_SERVER_BOUNDARY },
            { regex: '^#', message: VIEW_SERVER_BOUNDARY },
            { regex: '^(@lit(-[a-z]+)?/|lit($|/|-))', message: VIEW_CLEAN_ROOM },
          ],
        },
      ],
    },
  },
  {
    // Layer 1 (drivers, testing) may depend on @gyral/core only (ARCHITECTURE.md).
    files: ['packages/{http,router,time,testing,devtools}/src/**/*.ts'],
    ignores: ['packages/*/src/internal/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            {
              group: ['@gyral/*', '!@gyral/core'],
              message:
                'Layer-1 packages may only import @gyral/core (ARCHITECTURE.md). Move shared code into core or invert the dependency.',
            },
          ],
        },
      ],
    },
  },
  {
    // Layer 2: @gyral/ssr may depend on core and router only (ARCHITECTURE.md).
    files: ['packages/ssr/src/**/*.ts'],
    ignores: ['packages/*/src/internal/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            {
              group: ['@gyral/*', '!@gyral/core', '!@gyral/router'],
              message:
                '@gyral/ssr may only import @gyral/core and @gyral/router (ARCHITECTURE.md).',
            },
            {
              group: ['@lit-labs/ssr', '@lit-labs/ssr/*'],
              message:
                'Labs APIs stay behind packages/ssr/src/internal/lit.ts (ADR 0005). Add what you need there.',
            },
          ],
        },
      ],
    },
  },
  {
    // Internal modules host the Labs adapters (ssr/src/internal/lit.ts); Effect is still
    // excluded there by the dependency check in scripts/check-public-api.mjs.
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
    // create-gyral is a Node CLI: no browser Baseline, no Gyral imports (it only copies files).
    files: ['packages/create-gyral/src/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'compat/compat': 'off',
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            {
              group: ['@gyral/*'],
              message:
                'create-gyral uses Node builtins only; the generated app depends on @gyral/* instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // @gyral/mcp is a Node MCP server: no browser Baseline. It answers from a corpus built at
    // build time, so it never imports Gyral at runtime (that would pin apps to its copy).
    files: ['packages/mcp/src/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'compat/compat': 'off',
      'no-restricted-imports': [
        'error',
        {
          ...effectImports,
          patterns: [
            ...effectImports.patterns,
            {
              group: ['@gyral/*'],
              message:
                '@gyral/mcp reads Gyral docs and types from its build-time corpus, not by importing Gyral.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);

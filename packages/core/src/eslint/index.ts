// @gyral/core/eslint: the template rules (view/09-template-rules.md) in the editor, as an
// ESLint flat-config plugin. ESLint is an optional peer dependency; nothing here reaches a
// browser or server bundle.
//
//   import gyral from '@gyral/core/eslint';
//   export default [gyral.configs.recommended];
import type { ESLint, Linter } from 'eslint';
import { rowPurityRule } from './row-purity-rule.js';
import { templateRule } from './template-rule.js';

export interface GyralPlugin extends ESLint.Plugin {
  readonly rules: {
    readonly template: typeof templateRule;
    readonly 'each-row-purity': typeof rowPurityRule;
  };
  readonly configs: { readonly recommended: Linter.Config };
}

const rules = { template: templateRule, 'each-row-purity': rowPurityRule };
const configs: { recommended: Linter.Config } = { recommended: {} };

const plugin: GyralPlugin = { meta: { name: '@gyral/core/eslint' }, rules, configs };

// The config names the plugin object itself, so it can be combined with configs that register
// `gyral` too (ESLint rejects two different objects under one plugin name).
configs.recommended = {
  name: 'gyral/recommended',
  plugins: { gyral: plugin },
  rules: { 'gyral/template': 'error', 'gyral/each-row-purity': 'error' },
};

export default plugin;
export { rowPurityRule, templateRule };

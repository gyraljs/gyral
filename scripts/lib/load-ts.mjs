// Lets Node import the workspace packages' TypeScript sources directly (eslint.config.js loads
// @gyral/core's ESLint plugin from packages/core/src/eslint/ without a build): relative `.js`
// specifiers resolve to the `.ts` file beside them, and `.ts` files under packages/ are
// transpiled with TypeScript. In-thread synchronous hooks (node:module registerHooks).
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const PACKAGES = new URL('../../packages/', import.meta.url).href;
const FLAG = Symbol.for('gyral.load-ts');
const inPackages = (url) => url?.startsWith(PACKAGES) === true && !url.includes('/node_modules/');

if (!(FLAG in globalThis)) {
  Object.defineProperty(globalThis, FLAG, { value: true });
  registerHooks({
    resolve(specifier, context, next) {
      if (inPackages(context.parentURL) && /^\.\.?\/.*\.js$/.test(specifier)) {
        const url = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (!inPackages(url) || !url.endsWith('.ts')) return next(url, context);
      const file = fileURLToPath(url);
      const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          useDefineForClassFields: false, // as tsconfig.base.json
          verbatimModuleSyntax: true,
        },
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    },
  });
}

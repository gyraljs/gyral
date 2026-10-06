// The `gyral-compiled` build of core's `#prepare` import (view/01-templates.md "Compiled"):
// with the Vite preset's template compiler every `html` template is precompiled, so the
// runtime preparer is left out of the bundle. Reaching this means one template was not.
import type * as Prepare from './prepare.js';

export const prepare: typeof Prepare.prepare = (strings) => {
  const start = strings.join('${…}').replace(/\s+/g, ' ').trim().slice(0, 80);
  throw new Error(
    `gyral: an html template was not compiled: \`${start}\`. This build resolves the ` +
      `gyral-compiled condition, which leaves out the runtime template preparer, so every ` +
      `html\`…\` must go through the Gyral Vite preset's template compiler (dependencies ` +
      `included). Make sure the module containing it is processed by Vite, or drop the ` +
      `gyral-compiled condition to use the runtime preparer (view/01-templates.md).`,
  );
};

export const verify: typeof Prepare.verify = () => undefined;

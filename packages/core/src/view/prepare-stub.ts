// The `gyral-compiled` build of core's `#prepare` import (view/01-templates.md "Compiled"):
// with the Vite preset's template compiler every `html` template is precompiled, so the
// runtime preparer is left out of the bundle. Reaching this means one template was not.
import type * as Prepare from './prepare.js';

export const prepare: typeof Prepare.prepare = (strings) => {
  const start = strings.join('${…}').replace(/\s+/g, ' ').trim().slice(0, 80);
  throw new Error(
    `gyral: an html template was not compiled: \`${start}\`. This gyral-compiled build has no ` +
      `runtime template preparer: compile every html\`…\` (dependencies included) with the ` +
      `Gyral Vite preset, or drop the gyral-compiled condition (view/01-templates.md).`,
  );
};

export const verify: typeof Prepare.verify = () => undefined;

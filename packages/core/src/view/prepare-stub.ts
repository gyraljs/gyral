// The `gyral-compiled` build of core's `#prepare` import (view/01-templates.md "Compiled"):
// with the Vite preset's template compiler every `html` template is precompiled, so the
// runtime preparer is left out of the bundle. Reaching this means one template was not.
import type * as Prepare from './prepare.js';
import { message } from './message.js';

export const prepare: typeof Prepare.prepare = (strings) => {
  const start = strings.join('${…}').trim().slice(0, 80);
  throw new Error(message(70, start));
};

export const verify: typeof Prepare.verify = () => undefined;

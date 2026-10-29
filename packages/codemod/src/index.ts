// @gyral/codemod's programmatic API (the `gyral-codemod` bin is ./cli.ts): run a release's
// transforms over files, or over one module's source. Everything else is internal.
export { releases, runCodemod } from './run.js';
export type { CodemodOptions, CodemodResult } from './run.js';
export { transformSource } from './transform.js';
export type { FileResult, Finding } from './transform.js';

// `@gyral/core/compiled`: the entry the Vite template compiler's output imports `compiled`
// from (view/01-templates.md "Compiled"). Internal: apps never import it themselves, and it is
// not documented as API. A subpath of its own, so the main entry's API stays as documented
// and compiled code still shares the one template module with `html` (same package copy).
export { compiled } from './template.js';

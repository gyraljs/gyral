// Hydration is built into @gyral/core since 0.3.0 (view/07-hydration.md): each server-rendered
// component adopts its DOM on its own. This entry point stays so 0.2's
// `import '@gyral/ssr/hydrate'` keeps resolving; it exports nothing and adds nothing to client
// bundles. Remove the import (docs/references/migrating-0.2-to-0.3.md).
export {};

// Import this FIRST in a server-rendered app's client entry, before anything that imports
// `lit` or `@gyral/core`. It makes LitElement hydrate existing Declarative Shadow DOM
// instead of re-rendering it (ADR 0012).
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import { hydrate } from '@lit-labs/ssr-client';

// Light-DOM components (ADR 0014) hydrate through Lit's public hydrate(), which core finds
// under this global symbol (core's HYDRATE_KEY; a symbol rather than an import so this entry
// stays first in load order and core never depends on @lit-labs/ssr-client). gyral-czi.38.
(globalThis as Record<symbol, unknown>)[Symbol.for('gyral.hydrate')] = hydrate;

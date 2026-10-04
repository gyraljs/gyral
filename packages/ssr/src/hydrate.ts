// Import this FIRST in a server-rendered app's client entry, before anything that imports
// `lit` or `@gyral/core`. It makes LitElement hydrate existing Declarative Shadow DOM
// instead of re-rendering it (ADR 0012).
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';

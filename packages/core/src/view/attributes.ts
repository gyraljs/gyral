// Host attributes the server renderer writes (view/06-server.md "Components") and the client
// reads (07). Core's hydration.ts, light-dom.ts and islands.ts declare the same names for the
// client; server-components.node.test.ts checks that they match.
/** Host attribute holding a component's JSON seed (ADR 0012); the client removes it. */
export const SEED_ATTRIBUTE = 'data-gyral-seed';
/** Marks a server-rendered light-DOM host (ADR 0014), so hydration knows its own content. */
export const LIGHT_ATTRIBUTE = 'data-gyral-light';
/** A deferred island's strategy (07 "Islands"), next to `defer-hydration`. */
export const ISLAND_ATTRIBUTE = 'data-gyral-hydrate';
/**
 * Marks a host whose `init` or view threw on the server (ADR 0024): it carries its error view
 * (or nothing) and no seed, and the client starts it fresh instead of hydrating.
 */
export const ERROR_ATTRIBUTE = 'data-gyral-error';

// `<gyral-stores>` on the server (gyral-czi.20, ADR 0013 addendum). In the browser a provider
// is a plain element: scopeFor() walks the DOM to it. Until 0.3.0 the server needed it as a
// registered element; the Gyral server renderer (view/06-server.md "Components") renders it
// like any element and writes its `data-gyral-stores` seed itself (Phase 4, gyral-g1r.9).

/**
 * Kept so `@gyral/ssr` can call it during the swap; does nothing. Removed with the Phase 4
 * server renderer, which handles `<gyral-stores>` itself.
 */
export function defineStoresProvider(): void {
  // Nothing to register: see the module comment.
}

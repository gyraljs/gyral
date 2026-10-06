// Kept as an entry point during the view-layer swap (ADR 0018). Until 0.3.0 this module made
// Lit hydrate server-rendered DOM; hydration is now built into @gyral/core
// (view/07-hydration.md), so importing it does nothing and pulls nothing into client bundles.
export {};

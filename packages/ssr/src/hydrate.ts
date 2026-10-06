// Kept as an entry point during the view-layer swap (ADR 0018). Until 0.3.0 this module made
// Lit hydrate server-rendered DOM; hydration now belongs to @gyral/core (view/07-hydration.md,
// Phase 5, gyral-g1r.10), so importing it does nothing and pulls nothing into client bundles.
// Until Phase 5, a server-rendered host resumes from its seed and renders fresh.
export {};

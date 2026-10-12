# ADR 0031 — Build-time component style metadata

Status: **accepted**, shipped in 0.3.2. Bead: gyral-49t.10. Extends ADR 0016 and 0020.

Policy-only servers and static proxies need the exact shadow `<style>` hashes without
executing every component module at request time. AST extraction cannot correctly evaluate
imported CSS, style arrays or interpolated CSS results.

`writeComponentStyleManifest({ root, clientDir, outFile, vite? })` is a Node build helper in
`@gyral/ssr/static`. After a `components: true` client build it reads the preset's discovered
and explicitly listed component module paths, imports them in a temporary SSR bundle and
isolated Node process, and collects existing `styleHashes()`. The JSON artifact is
`{ schema: 1, hashes: [...] }`, with sorted, deduplicated quoted SHA-256 CSP sources.
This hashes exactly what the server serializes, including its escaping and style grouping.

The application supplies trusted, SSR-safe component modules and any build-time aliases or
plugins. Top-level initialization executes once in this build process. This is opt-in and
does not evaluate arbitrary source while scanning a client build. Failure aborts the step;
temporary files and the child process are bounded. Client-only/browser-only modules must
be refactored or use a deliberate registration entry with the existing `styleHashes()` API.

Deploy this standalone JSON alongside its matching release. A policy server validates its
schema and hash source shape and passes `hashes` as `CspOptions.componentStyleHashes`.
Supplied hashes append to registered component/global style hashes; attribute hashing and
its buffering/cap remain separate. Reading the artifact needs no component imports or Vite.
Vite is dynamically loaded only by the build helper. No new runtime dependency is added.

The production browser fixture verifies automatic collection, deterministic metadata,
isolated policy construction, a real CSP response header, no-JS first paint, hydration,
CSSOM changes, native nesting, system light/dark and a locally dark component.

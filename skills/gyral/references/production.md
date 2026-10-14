# Production integration boundaries

Use these alongside `ssr.md`. App routing, authorization, cache policy, response headers,
proxy trust, resource budgets, metrics and graceful shutdown belong to the host application.

## Strict CSP

On 0.3.1, import trusted SSR-safe components during the build and collect `styleHashes()`.
Store their quoted SHA-256 sources with the matching HTML/client release. A policy-only
server or proxy can build its complete CSP from that artifact. Shadow `<style>` hashes and
inline `style` attribute sources are different directives. Document CSS should be linked
from Vite's manifest; `style-src 'self'` permits same-origin files without changing native
nesting, theme functions or local `color-scheme` behavior.

Since 0.3.2, the `@gyral/ssr/static` helper `writeComponentStyleManifest({ root, clientDir,
outFile, vite? })` automatically imports the client metadata's component modules in an
isolated build-time Node process. It writes `{ schema: 1, hashes: [...] }`. Pass validated
hashes as `CspOptions.componentStyleHashes`; 0.3.1 lacks both APIs.
It executes module initialization, so review modules and split browser-only initialization.

`styleAttributes: 'hash'` buffers the whole page before headers and caps distinct sources at
128 by default, about seven KiB before the rest of the headers. Prefer finite classes/data
attributes for large state spaces. Values past the cap are blocked on parser first paint;
CSSOM after hydration is a separate behavior. `raw()` values are not collected, and static
prerendering emits no per-page header. Test no-JS first paint and the app's maximum value
count against the real proxy. Keep one effective policy owner and update policy with assets.
Vite nonce placeholders need per-request replacement in both HTML/meta and the CSP header;
development HMR needs its exact WebSocket origin in `connect-src`.

## Node bundles and composition

Keep `gyralDevServer` in the development entry. Production imports `toNodeListener` from
`@gyral/ssr/node`; a single-file SSR bundle can tree-shake the unused Vite helper. With Vite 8,
use `ssr.noExternal` for bundled Gyral and `rolldownOptions.output.codeSplitting: false`.
Keep Node builtins external. Verify the emitted artifact with no runtime Vite installed.

Read `componentsFromManifest` before deleting `.vite`. Its `modules` field is a Map:
serialize `[...assets.modules]` and restore `new Map(entries)`, while retaining loader,
preloads and stylesheet lists. Embed deployment metadata in code or ship validated JSON;
keep its release/assets consistent. Mutable application records remain runtime data.

Fetch handlers receive `{ incoming, remoteAddress }`. The peer is the socket peer; forwarded
headers need a trusted-proxy boundary. Set a fixed public origin for absolute URLs. Route
WebSocket upgrades separately, validating path, Origin and authentication before accepting.
Carry Request.signal into reads; cancellation does not undo a committed mutation. Drain
HTTP/upgrades, close sockets and dispose app resources within the application's stop budget.

## Offline lazy workspaces

A merged dynamic chunk may lack `src` or `isDynamicEntry`. Since 0.3.2, the component
metadata's `chunkModules` maps actual emitted chunks to root-relative original module IDs; 0.3.1
does not emit it. Assign app feature ownership from emitted IDs, following static edges for
shared code/CSS and selected dynamic edges for feature pins. Worker outputs are a separate
build graph. Keep worker/font/image URLs too. Explicit `components.modules` handles wrappers
and intentional grouped registration, while `chunks` maps tags to their actual output.

Preload transformations must happen before HTML parsing. A reproduced worker-controlled
warning can justify scoped app handling, preserving scripts/CSS and useful first-network
preloads; runtime JS hints need the same policy. No verified Chromium 154 fix is established.
Test cold offline feature use, controlled reload and two-release replacement. Retain old
hashes for open tabs and rollback within a deliberate storage/time budget. Private responses
need separate caching/logout policy; never serve new bytes at an old hashed URL.

## Rust

Choose Rust API plus build-time pages, Askama plus client widgets, or experimental `gyral-rs`
embedded SSR. The first path needs no gyral-rs. The reviewed embedded ABI is 1,
exact core/SSR npm 0.3.5, Linux x86_64 GNU, Rust 1.99.0, deno_core 0.412.0/V8 150.4.0.
gyral-rs is on crates.io (`gyral`); each minor release accepts one exact Gyral version (0.2.x:
0.3.4, 0.3.x: 0.3.5), so check its README before upgrading Gyral in a Rust-served app.
Trusted SSR code is a bundled IIFE; the browser has one self-contained ESM entry.
Props/HTML/bundle limits are 256 KiB/2 MiB/8 MiB. Rust verifies digests/SRI/CSP, owns request
DTO permissions, cancellation and worker shutdown. These resource bounds are not an
untrusted-code sandbox. Candidate Gyral releases need a newly reviewed Rust contract/fixture;
the 0.3.5 fixture does not establish split chunks, streaming, dynamic CSS or full-application
readiness. The snapshot experiment remains test-only.

# Deploying a strict Content Security Policy

This recipe uses the build metadata API of
[ADR 0031](../design-docs/0031-build-style-metadata.md), available since 0.3.2. Applications on
0.3.1 can obtain the same shadow-style sources by importing their components and calling
`styleHashes()` at build time.

## Build policy metadata

Build the browser with `gyralVitePreset({ components: true })`. Before deleting `.vite`,
call `writeComponentStyleManifest({ root, clientDir, outFile })` from `@gyral/ssr/static`.
The helper finds discovered and explicitly listed components, bundles their registration
modules, and executes that bundle in a fresh Node process. Supply application aliases or
plugins through `vite` when required. These are trusted, SSR-safe application modules;
their initialization executes during the build. A browser-only module must be split from
its component definition first.

The resulting JSON is `{ "schema": 1, "hashes": ["'sha256-…'"] }`. Sources are sorted and
deduplicated from the actual serialized shadow style text. Retain this artifact with the
matching server HTML and browser assets. A policy-only server can validate its schema and
SHA-256 source strings, then pass `hashes` as `componentStyleHashes` to
`contentSecurityPolicy()` or `renderPage({ csp })`. It needs no component imports.
Registered component and document style hashes are still appended.

When a proxy supplies CSP, build its complete header from that same artifact. Hashing
shadow styles does not replace directives for document CSS, scripts, workers or connections.
Keep one effective policy owner: a second CSP header adds another enforcing policy and can
block content even when the application's header permits it. Reload the proxy policy when
the release's style text changes; keep old assets and the old policy available for rollback.

## Document CSS and first paint

Import document CSS from the browser entry so Vite emits a hashed stylesheet, and include
the manifest's `stylesheets` in the server page. `style-src 'self'` allows same-origin links.
Native nesting, `light-dark()`, `color-scheme`, and a locally dark subtree keep their browser
semantics. Moving CSS into a file does not require flattening nesting or changing selectors.
Small critical inline document styles belong in `page.styles`, which Gyral hashes.
Handwritten `<style>` in `extraHead` is outside automatic collection.

SSR `style` attributes need a separate first-paint decision. Prefer finite classes or data
attributes for bounded states. For a few necessary values use
`csp: { styleAttributes: 'hash' }`. This buffers the entire HTML before sending the header,
then adds `style-src-attr 'unsafe-hashes'` sources for each distinct serialized value.
The default cap is **128**, approximately **7 KiB** before other policy directives and
headers. Development warns above 32. Above the cap, additional values are blocked on first
paint; CSSOM updates after hydration cannot repair a no-JavaScript page. Test the largest
page against your actual proxy/header limit, rather than raising the cap automatically.
Repeated identical values share a hash. `raw()` HTML is not collected.

Use a stylesheet fallback for custom properties whose first value may be blocked. Changes
through Gyral's client CSSOM bindings work after hydration, but that is separate from the
initial HTML parser applying an attribute under CSP. Static prerendering does not emit a
per-page HTTP header; the static host must supply a matching policy.

## Development and verification

Production `script-src 'self'` is insufficient for every Vite development setup. Configure
Vite's `html.cspNonce` placeholder when the development policy requires a nonce. Replace
the placeholder in HTML and its meta tag per request, with the same fresh nonce in the
response header. Allow the exact HMR WebSocket origin in
`connect-src` and any deliberately separate asset origin. Avoid copying development nonce
or HMR allowances into production. The app/proxy owns those headers and credentials.
See [Vite's CSP guidance](https://vite.dev/guide/features.html#content-security-policy-csp).

`packages/ssr/test/build-style-metadata.node.test.ts` builds a real client and metadata
artifact, constructs policy without importing components, and serves a real CSP header.
Chromium checks no-JavaScript first paint, native nesting, system light/dark, a local dark
subtree, hydration and a subsequent CSSOM change without policy violations. The existing
style-attribute tests cover deduplication and the header cap. Include your document links,
largest value count, reverse proxy, and native form interactions in application acceptance.

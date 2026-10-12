# Lazy workspaces and offline assets

Gyral loads rendered component tags; the application owns service-worker cache policy,
feature pins, authorization, storage quotas and release retention. A dynamic import is
not enough to classify an asset as feature-owned. Vite can merge workspace modules into
chunks with no separate source or `isDynamicEntry` manifest entry.

The component metadata of the next release (unreleased) includes `chunkModules`, mapping
each emitted JavaScript chunk to its original module paths relative to the build root. Paths outside that root
can contain `../`; use them as ownership identifiers, never as unchecked filesystem paths.
`chunks` still maps tags to their actual emitted chunks. This addition is compatible with
the existing `componentsFromManifest` reader; npm 0.3.1 does not yet emit `chunkModules`.

Assign ownership from the emitted module IDs and your workspace feature boundaries. Walk
static imports to retain shared code and CSS. Walk dynamic edges only for features selected
by your cache policy. Shared chunks belong to every feature that needs them; a merged chunk
containing two features cannot be cached as if the bundler had separated them. Use explicit
`components.modules` for wrapper definitions or deliberate grouped registrations. Retain
worker URLs, fonts, images and other build assets as well as JavaScript. Vite's worker builds
are separate output graphs; main-build module IDs alone cannot establish worker ownership.

`packages/ssr/test/pwa-release.node.test.ts` builds two real releases. Its grouped workspace
component includes a child with no independent output chunk, and shares code/document CSS
with a second component. Chromium installs an app-owned worker, opens a cold offline page,
loads a never-visited feature and module worker, reloads offline, then replaces the release.
An old tab still loads its old hashed feature while a new tab loads the current version.
The fixture precaches the complete graph to test retention; per-feature selective caching
must additionally prove that unrelated preparation data stays out of a feature's pin.

## First navigation, controlled reload and warnings

Uncontrolled first navigation can retain the server's useful modulepreload graph. Once a
worker controls a document, it must preserve the script URLs, CSS links and the necessary
static graph while applying any preload workaround **before the HTML parser sees it**.
Removing links after hydration cannot stop parser-initiated fetches. Vite's runtime hints
also need an application policy: filter JavaScript dependency hints while keeping CSS
dependency loading. Changing only server HTML does not change lazy-import hints.

One consumer's reported cross-world warning and local workaround are documented in its
feedback. The expanded graph error was an application ownership error; no framework loader
defect is established. The exact warning has not been reproduced by this Gyral fixture.
There is no verified claim here that Chromium 154 or another version fixes it. Record the
browser version, controlling worker, first/controlled/offline navigation and exact console
message when investigating. Do not remove every preload on every browser based on an
unverified version claim. An application with a reproduced warning can retain its scoped,
tested response transformation while checking network duplication and stylesheet loading.

## Retain and retire releases deliberately

Publish assets before switching the document/server metadata. Do not delete the old cache
or server hashes immediately on worker activation: open tabs may import them later. Choose
an explicit retention window and storage budget, retain rollback artifacts, and test the
app's update prompt and stale-tab behavior. Never serve one version's JS at another
version's hashed URL. Cached HTML, component seeds, CSS/CSP and scripts form one release.
Authenticated pages and private records require separate cache rules and logout handling.

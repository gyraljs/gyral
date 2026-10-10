# ADR 0016 — Production builds: one route table, three render modes

Status: **accepted** (2026-10-04). Bead: gyral-4k7.3. Builds on ADR 0012 (SSR).

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): whitespace minification moves into the template normalizer ([view/01-templates.md](view/01-templates.md)). Lit-specific text below describes 0.2.x.

## Context

Until now the SSR examples only had dev servers (Vite middleware mode). A real app needs a
production build, and content that is the same for everyone (home page, docs, about) should not
be rendered on every request. The lit-web-apps skill's rule is "one route table, three render
modes": `ssg` (rendered at build time), `ssr` (per request), `csr` (client only).

## Decision

- **Route modes live next to the route table** (`examples/isomorphic/src/routes.ts`:
  `modes = { home: 'ssg', about: 'ssr' }`). The prerender step renders the `ssg` paths; nothing
  else needs to know.
- **One renderer.** `prerender({ app, paths, outDir })` sends a real `Request` for each path to
  the same app that serves `ssr` routes and writes `<outDir>/<path>/index.html`. A non-200
  response fails the build, so an `ssg` route can't silently ship an error page.
- **`@gyral/ssr/static`** is a separate, Node-only subpath (it uses `node:fs`). The main entry
  stays runtime-neutral. It exports `prerender`, `staticFileFor`, `clientEntryFromManifest`
  (reads Vite's `.vite/manifest.json` for the hashed entry URL), `cacheHeaders` and
  `productionServer`.
- **`productionServer({ distDir, createApp })`** returns a framework-neutral `{ fetch }`:
  - `GET /assets/*`: the Vite client build, `cache-control: public, max-age=31536000, immutable`;
    paths resolving outside `client/` are refused (404).
  - `GET` of a prerendered path: the `static/` file, `public, max-age=0, must-revalidate`.
  - Everything else (other GETs, POSTs): the request-time app; `no-cache` unless it set a policy.
- **Build layout:** `dist/client/` (Vite, `build.manifest: true`, the client entry as the only
  input) and `dist/static/` (prerendered pages). Scripts: `pnpm build` (`vite build`, then the
  prerender script when the app has `ssg` routes) and `pnpm start`.

## Consequences

- `examples/isomorphic` prerenders `/` and server-renders `/about`; `examples/register` (all
  `ssr`, forms POST) uses the same production server.
- Tests: `ssr/test/static.node.test.ts` (helpers, cache policies, traversal) and
  `examples/isomorphic/test/prod.node.test.ts` (a real Vite build, prerender, then requests).
- Prerendered pages hydrate exactly like server-rendered ones: they are the same HTML, seeds
  included. Personalized content must stay `ssr` (or be fetched after hydration).
- Not covered yet: incremental regeneration, prerendering parameterized routes (pass their paths
  explicitly), and compressing static files at build time.

## Addendum: template whitespace (2026-10-05, gyral-9rf, branch exp/whitespace)

Profiling (gyral-1kq) found Lit's indentation whitespace text nodes to be the main DOM cost in
Gyral's list rendering: 25 nodes per benchmark row against 9 for compiled frameworks. Gyral's
`html` and `svg` now minify template strings (`packages/core/src/template-whitespace.ts`).

- **Runtime, not a Vite transform.** A build-time transform only reaches code that Vite
  compiles; prerender scripts run by tsx or Node, and `@lit-labs/ssr` in plain Node, would keep
  the original strings, and a different template digest breaks hydration. Minifying inside the
  tag (once per call site, cached by the strings array) makes server and client identical by
  construction. Cost: one linear scan per template call site; Lit's own template preparation
  per call site is far larger.
- **Rules** (consumer-setup.md, "Template whitespace"): drop newline-containing whitespace
  where CSS never renders it (template edges, block-level tags, inside edges of
  `<button>`/`<select>`), collapse elsewhere to one space, never touch raw-text elements,
  `<pre>`, tags, attributes or comments, never move bindings. Idempotent.
- **Opt-out:** templates whose text relies on CSS `white-space: pre*` outside `<pre>` import
  `html` from `lit`.
- **Verified:** unit tests on tricky templates, golden SSR fixtures regenerated, hydration of an
  indented page in dev and production Lit, 13 nodes per benchmark row.

## Addendum: serving assets (gyral-dyn.1, 2026-10-08)

Feedback from an app on a persistent-volume host found `/assets/*` serving fragile: a malformed
escape (`/assets/%E0%A4%A`) threw `URIError` out of `fetch`, `HEAD` fell through to the app,
images, `.wasm`, `.json` and `.mjs` were served as octet-stream, every request read the file
again, a miss could be cached by a CDN, and every page request first tried a file in `static/`
even for apps that prerender nothing. The asset half is now its own export:

- **`assetHandler({ dir, prefix = '/assets/', cache = true })`** (`@gyral/ssr/static`) returns
  `(request) => Promise<Response | undefined>`: `undefined` outside the prefix, so it composes
  with any router. `GET` and `HEAD` (same headers, no body); other methods 405 with `allow`.
  Hits carry `cache-control: public, max-age=31536000, immutable`, `content-type` by extension
  (the files a Vite build emits: scripts, CSS, source maps, JSON, images, fonts, wasm, media),
  `content-length` and `x-content-type-options: nosniff`.
- **Refusals.** A malformed escape is a 400. After decoding, a path with an empty, `.` or `..`
  segment, any segment starting with a dot (bookkeeping such as a volume's `.releases/`),
  backslashes leading out or a NUL is a 404, and the resolved file must still be inside `dir`.
- **Misses are `no-store`.** On hosts that keep every release's files, a file missing now may
  arrive with the deploy in progress; a cached 404 would outlive it. Misses are also never
  cached in memory.
- **Memory cache.** Hashed files never change, so hits stay in memory, bounded by bytes
  (default 64 MiB; `cache: { maxBytes }`), least recently served dropped first; `cache: false`
  reads every request from disk. A file larger than the bound is served but not kept.
- **`productionServer`** uses it, with `assetsDir` (default `<distDir>/client/assets`; point
  it at the volume) and `cache`; `staticDir` (default `<distDir>/static`, or `false` for apps
  with no `ssg` routes) for prerendered pages, which now answer `HEAD` too and carry
  `content-length` and `nosniff`.
- Range requests (gyral-dyn.32): a single `bytes=` range gets a 206 with that slice and
  `content-range`, so imported video and audio can seek (Safari won't play video without it);
  an unsatisfiable range is a 416, and several ranges get the whole file (RFC 9110 allows it).
  Every asset says `accept-ranges: bytes`. `If-Range` is ignored: a hashed file never changes.
- Vite's `base` (gyral-dyn.32): the manifest's paths omit it, so `clientAssets`,
  `clientAssetsFromManifest` and `clientEntryFromManifest` take `{ base }`, and
  `productionServer({ base })` starts every URL with it and serves assets at `<base>assets/`.
- Not covered: precompressed files (`.br`/`.gz`) and `ETag`s; hashed URLs make revalidation
  unnecessary. Put a CDN or reverse proxy in front for compression.

Tests: `packages/ssr/test/assets.node.test.ts` (each bug above, types, traversal, cache bound,
configurable directories).

## Addendum: hashed stylesheets (gyral-dyn.2, 2026-10-08)

`page({ styles })` inlines the app's global CSS into every page, which costs bytes per page and
can't be cached. Vite already bundles CSS imported from the client entry into content-hashed
files and lists them in the manifest (`ManifestChunk.css`), which `clientAssets` ignored.

- **`ClientAssets.css`**: the CSS files of the chunks `clientAssets` walks: the entry, its
  static imports and the `also` modules with theirs (the hydration chunk has none). Each
  chunk's files come after its imports' files, the order the modules evaluate in and the order
  Vite itself links them in HTML builds, so the cascade matches the dev server's. Each file
  once.
- **`page({ stylesheets })`** writes `<link rel="stylesheet" href>` per URL in the head, before
  the inline `styles`, so small inline overrides still win on equal specificity.
- **`productionServer`** hands `createApp` `stylesheets` beside `modulepreload`, and a new
  `assets(modules)` returning `{ modulepreload, stylesheets }` with those modules added (cached
  per list), named so it spreads into `renderPage`. `preload(modules)` keeps its type (a URL
  list for `modulepreload`) and equals `assets(modules).modulepreload`: changing its result to
  carry CSS would break 0.3.0 apps that pass it straight to `modulepreload`.
- **CSP:** linked files are same-origin, so `style-src 'self'` (the default
  `contentSecurityPolicy()` writes) allows them without hashes.
- **The app's part:** import the CSS from the client entry (`import './app.css'`), so it is in
  the client build. CSS only a lazily loaded module imports is linked only when that module is
  named in `also`/`assets(modules)`; otherwise Vite's preload helper loads it with the chunk.

Tests: `packages/ssr/test/stylesheets.node.test.ts` (ordering and dedupe on a manifest, the link
markup, the `createApp` options, and a real Vite build whose entry and lazy module import CSS,
served as `text/css`).

## Addendum: Node adapter (gyral-dyn.6, 2026-10-08)

Everything `@gyral/ssr` returns is a web `Response`, so Node apps needed Hono's
`@hono/node-server` or their own glue (one app's was 78 lines). `@gyral/ssr/node` exports
`toNodeListener(fetch, { origin?, onError? })`, a `node:http` request listener. Node-only, on
its own subpath like `/static`; the main entry stays runtime-neutral.

- **Request.** Method, headers (from `rawHeaders`, repeated headers kept, HTTP/2 pseudo-headers
  skipped), and for methods other than `GET`/`HEAD` the body as a stream (`duplex: 'half'`).
  The URL is the request target appended to `origin` (default: the scheme of the socket plus
  the `Host` header). The target is never resolved against the origin, so `//evil.example/x`
  stays a path; an absolute-form target keeps only its path and query. A target or `Host` that
  makes no URL is a 400.
- **Abort.** `request.signal` aborts when the response closes before it finished (the client
  went away). The body being written is cancelled then, which ends `renderToStream`'s
  iterator.
- **Response.** Status, status text when set, headers; `set-cookie` from `getSetCookie()` as
  separate headers (joined with `", "`, cookie dates would be ambiguous). `HEAD` and null bodies
  end after the headers (a `HEAD` body is cancelled).
- **Backpressure.** One `res.write` per chunk read; when Node's buffer is full the loop waits
  for `drain` (or the abort), so a pull-based body such as `renderPage`'s is rendered only as
  fast as the client reads. An explicit loop instead of `stream.pipeline`: a body that fails
  must be told apart from a client that left, and `pipeline` destroys the response either way.
- **Errors.** A throwing handler or failing body goes to `onError` (default `console.error`);
  before the headers it is a `no-store` 500, after them the connection is destroyed so the
  client never sees a truncated page as complete. Errors after the client left are ignored.
- **Connection info** (gyral-dyn.29). The handler's second argument is
  `{ incoming, remoteAddress }`: the Node request and `req.socket.remoteAddress`, for apps
  that rate-limit, log or audit by client. `incoming` is the shape Hono's Node adapter uses, so
  `getConnInfo` from `@hono/node-server/conninfo` works on a Hono app mounted this way.
  `productionServer`'s `fetch` forwards this second argument to the app (`FetchApp<Env>`,
  `productionServer<NodeEnv>(…)`), so an app behind it sees it too (gyral-dyn.30). Behind a
  proxy the address is the proxy's; `X-Forwarded-For` is trusted only from a known proxy, which
  the app decides, not the adapter.

Tests: `packages/ssr/test/node.node.test.ts`, on a real server: streamed request bodies, URL
building (origin, `//` targets, absolute-form), a `renderPage` response, `HEAD`, separate
cookies, a paused client holding the producer back and a disconnect cancelling it, 500s,
mid-body failures, a bad `Host`, the connection info argument.

## Addendum: automatic component loading (gyral-1zd.22, 2026-10-09)

Decision O10 of the API surface assessment. Pages used to load components through a client
entry the app kept by hand, plus a per-page flag deciding whether to include it; the server, the
CSP step and the entry each needed side-effect imports. A forgotten flag or import failed
silently (a component that never hydrated, or a CSP violation). Astro's islands are the model:
the page loads exactly the components it rendered.

- **Build.** `gyralVitePreset({ components: true })` (include: `['src']` by default) finds every
  two-call `define<…>()('tag', …)` in the app's source files (test files and
  `customElements.define` excluded) and adds a loader, `virtual:gyral/components`, to the client
  build's input. The loader holds a `tag → () => import(module)` table, so each component module
  becomes its own chunk. The build writes `.vite/gyral-components.json` next to Vite's manifest:
  the loader's file and each tag's manifest key.
- **Render.** Core's server render collects the tag of every component it writes (`tags`
  option, server only). `renderPage({ components })` writes the tail after the body, where
  every tag is known: the rendered components' modules with their static imports and Gyral's
  hydration chunk as `modulepreload` links (deduplicated), their hashed CSS, and the loader. A
  page that rendered no component gets no script at all. A rendered tag the manifest doesn't
  know is a development warning. The CSP header still lists every registered component's
  `<style>` hash: the header goes out before the body is rendered.
- **Client.** The loader imports a tag's module the first time that tag is in the document, now
  or after a later mutation (one `querySelector` per pending tag, once per microtask), and
  never twice. Since gyral-1zd.29 it also watches the shadow roots of the components it defined
  (their nested roots too, with the same MutationObserver), so tags rendered there load without
  the parent importing them; a removed host's root is dropped from the scan and its observer
  registration is collected with it. The loader registers itself under
  `Symbol.for('gyral.components')`, and core's `componentsReady()` awaits it: every rendered tag
  it knows is defined, then `settled()` (tests and page scripts; plain `settled()` without the
  loader). `hydrate:` strategies are unchanged: they
  decide when a loaded component hydrates.
- **Serving.** `componentsFromManifest(clientDir)` reads a build; `productionServer` hands
  `components` to `createApp` and no longer needs a client entry. An app that also needs
  app-wide setup (`provideDrivers`) keeps a small entry and passes it in `scripts`; both work
  together.
- **Size.** The loader is 0.37 KiB gzip with one component before minification (less once minified), plus one table row per component. A components build costs +0.1 to +0.2 KiB gzip
  in all chunks against the same app with a hand-written entry (chunk boundaries); the
  examples' `initial` figure for such a build counts what a page rendering every component
  preloads (the loader, each module and the hydration chunk), so it is higher than an entry's
  static graph.
- **Migrating an app.** Turn `components` on, delete the client entry (or keep it for setup
  only), pass `components` from `productionServer`/`gyralDevServer`/`componentsFromManifest` to
  `renderPage`, and drop per-page island flags and client-side side-effect imports. The server
  still imports the components it renders.

## Addendum: development server (gyral-1zd.22, 2026-10-09)

Decision M8. Every SSR app wrote its own development server (seven copies across the audited
apps and examples, some buffering whole pages). `gyralDevServer({ entry, app, state?, port?,
hmrPort?, origin?, vite? })` in `@gyral/ssr/node` (it builds on `toNodeListener`, and Vite is an
optional peer loaded on first use): Vite in middleware mode serves client modules, CSS and HMR;
any other request loads the server module through `ssrLoadModule` (edits show at once) and
streams the app's response. `state` is created once from the first module, so in-memory data
survives reloads. A render error answers 500 with Vite's error overlay and the source-mapped
stack. With the preset's `components`, the app gets `components` for development (the loader
from source and Vite's client). It lives in `@gyral/ssr/node` rather than `@gyral/core/vite`
because it is a server, not build configuration, and needs the Node adapter.

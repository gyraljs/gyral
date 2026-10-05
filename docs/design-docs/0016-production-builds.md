# ADR 0016 — Production builds: one route table, three render modes

Status: **accepted** (2026-10-04). Bead: gyral-4k7.3. Builds on ADR 0012 (SSR).

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

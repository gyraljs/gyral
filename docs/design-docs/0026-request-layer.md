# ADR 0026 — The request layer stays with fetch routers

Status: **accepted** (2026-10-09, owner decision O4 of the API surface assessment), shipped in
**0.3.1**. Bead: gyral-1zd.22. Builds on ADR 0012 (server rendering), ADR 0016 (production
builds, `productionServer`, the Node adapter) and ADR 0008 (forms).

## Context

Every server-rendered app built on Gyral needs routing, middleware (sessions, security headers,
rate limits), cookies and error pages. Gyral renders pages (`renderPage`), answers form posts
(`formAction`), serves a build (`productionServer`, `assetHandler`) and mounts on Node
(`toNodeListener`), but it has no server router, middleware chain or request context. The
audited apps filled the gap with Hono: one app imports it 46 times across 42 files, and every
server example in Gyral's own docs uses `new Hono()`. Where Hono met Gyral, the apps copied or
wrapped Gyral code:

- a copy of `formAction`'s private `wantsJson` in two routes, and `invalid: asJson` written 13
  times for endpoints only the JavaScript path calls;
- a wrapper around `productionServer.fetch` to add security headers and a CSP to prerendered
  files and assets, because there was no hook;
- a cookie queue, because `formAction` and `renderPage` return their own `Response`.

How other frameworks place the request layer (from the 2026-10-09 framework comparison):

| Framework                       | Request layer                                                   |
| ------------------------------- | --------------------------------------------------------------- |
| Next.js, React Router, TanStack | Meta-framework: route handlers, middleware, loaders and actions |
| SvelteKit                       | `hooks.server` `handle`, `+server` routes                       |
| Astro                           | Middleware, endpoints                                           |
| Nuxt, SolidStart                | Nitro / h3 server                                               |
| Qwik City                       | Middleware, `routeLoader$` / `routeAction$`                     |
| Lit, Preact (core), htmx        | None: the app brings its own server                             |

View libraries leave the request layer to the app; meta-frameworks ship one. Gyral renders whole
pages but is a view library at the request boundary.

## Decision

Gyral does not build a server router or middleware. A fetch router (Hono is the documented
example; any `(request) => Response` router works) owns routing, middleware, cookies and error
pages, and Gyral's server functions plug into it. Gyral fixes the seams instead:

1. **`formAction`'s `invalid` is optional.** Without it every rejection is the JSON 422, for
   endpoints only `submitForm` calls. With it, a browser post gets the handler's page and a
   fetch asking for JSON gets the 422, as before.
2. **`wantsJson(request)` is exported** from `@gyral/ssr`: the rule `formAction` answers by,
   for routes that serve both a page and JSON.
3. **`productionServer({ onResponse })`** sees every response (built assets, prerendered pages
   and the app's) before it goes out, for security headers, a CSP on files from disk, or
   cookies.
4. **Docs:** a "Request layer" section in the SSR skill and the consumer setup guide: Hono as the
   example, a cookie recipe (set cookies on the `Response` a Gyral function returns, or in
   `onResponse`), and an Origin / `Sec-Fetch-Site` CSRF check as middleware for apps that don't
   use tokens.

## Consequences

- No new package and no router to maintain; Hono (or another fetch router) stays a dependency of
  apps that route on the server, as it already is.
- Apps delete their copies of `wantsJson`, their `invalid: asJson` handlers and the wrapper
  around `productionServer.fetch`.
- Gyral's server API stays runtime-neutral: everything takes and returns web `Request` and
  `Response`, so it works the same on Node (`toNodeListener`), Deno, Bun or a worker.

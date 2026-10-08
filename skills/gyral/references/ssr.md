# Server rendering and hydration

Server rendering is Gyral's own (`@gyral/core/server`, spec:
docs/design-docs/view/06-server.md); `@gyral/ssr` (`renderPage`, `page`, `renderToString`,
`renderToStream`, `formAction`, `@gyral/ssr/static`) renders with it. Hydration is built into
core (docs/design-docs/view/07-hydration.md): each component adopts the server's nodes in
place, on its own, with no hydration import.

The server renders the same components to HTML: shadow components as Declarative Shadow DOM
(`<template shadowrootmode>` with the component's CSS in a `<style>`), light components
(`shadow: false`) as plain children. There is no DOM on the server: rendering a component is
`view(init(props))` written as text, synchronously. Each component carries a hydration seed
(`data-gyral-seed`: its props that no attribute carries, and its state unless it equals
`init(props)`). In the browser, each component hydrates on its own: core walks its template
and the server DOM in parallel and adopts the existing nodes, then `init`'s commands run.
Pages work before JavaScript loads.

## Rules

1. **Render synchronously from props and stores.** Components never fetch during the server
   render; commands don't run on the server. Load data in the request handler and pass it in
   (props, or store instances via `renderPage({ stores })`). After hydration, `init`'s
   commands run in the browser.
2. **No hydration import.** Hydration is built into core: the client entry just imports the
   components. Nothing depends on module evaluation order.
3. **State, props and store state are JSON-serializable** (they're the seed). Never put
   secrets (passwords, tokens) in state.
4. **Form state uses attribute spellings** (`value=${v}`, `?checked=${v}`, `?selected`,
   `<textarea>${v}</textarea>`), never property bindings: the server drops `.prop` bindings on
   plain elements. Hydration never overwrites what the user typed before scripts ran.
5. **Server and client must render the same markup for the same state.** Don't branch on
   `typeof window`, dates or randomness in a view; for JS-only UI, render the no-JS version
   first and switch in the `Hydrated` reducer. A mismatch throws `HydrationMismatch` in
   development (logged with the tag, template location, DOM path, expected and found; the
   component keeps the server's DOM) and, in production, warns and re-renders only that
   component. Browser extensions that edit the page before scripts run cause mismatches too.
6. **CSP:** scripts stay `script-src 'self'` (seeds are attributes, not scripts). Shadow
   components' `<style>` elements are allowed by hash, so `style-src` needs no
   `'unsafe-inline'`; Trusted Types need the `gyral` policy allowed: see
   "Content-Security-Policy" below.
7. **Light components own their children.** Don't write children inside a `shadow: false`
   component's tag (the server throws); pass data as props. Shadow components take children
   for their `<slot>`s.

## Request handler

`renderPage(options, init?)` returns a `Response` for a full document. Its body is chunked
output of a synchronous render, pulled one component boundary at a time: load all data before
calling it (nothing is awaited, there is no async or suspense streaming, and the head can't be
sent while data loads). Status and headers are final before the first byte, so a 404 is a real 404. It works with any framework that speaks `fetch` (Hono, `@gyral/ssr/node`, Workers).
Templates are core's `html`:

```ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';

export function home(request: Request): Response {
  const name = new URL(request.url).searchParams.get('name') ?? 'world';
  return renderPage({
    title: 'Home — My app',
    description: 'Server-rendered with Gyral.',
    lang: 'en',
    styles: ':root { color-scheme: light dark; }', // trusted CSS only
    body: html`<my-greeting name=${name}></my-greeting>`,
    scripts: ['/src/entry-client.ts'], // the built asset URL in production
  });
}
```

Also available: `page(options)` (the document template), `renderToString(value, { stores })`
and `renderToStream(value, { stores })`. Head content (`head`) is written with core's `html`
too. In development (Vite's dev server, Vitest) the output carries `<!--gyral:ID-->` markers
for hydration's checks; production output is the template HTML plus values. A `Promise`
anywhere in a view is an error: load data first.

### One URL per page: redirect to the canonical path

The router ignores one trailing slash, so `/products/x/` matches the same route as `/products/x`.
`match()` returns the canonical `path` (`href(name, params)`); redirect when the request's
pathname differs, so search engines and caches see one URL per page:

```ts
import { html } from '@gyral/core';
import { routes } from '@gyral/router';
import { renderPage } from '@gyral/ssr';

export const site = routes({ home: '/', product: '/products/:id' });

export function handle(request: Request): Response {
  const url = new URL(request.url);
  const m = site.match(url);
  if (m === undefined) return new Response('Not found', { status: 404 });
  if (m.path !== url.pathname) return Response.redirect(new URL(m.path + url.search, url), 301);
  return renderPage({
    title: m.name === 'product' ? `Product ${m.params.id}` : 'Home',
    lang: 'en',
    body: html`<my-app path=${m.path}></my-app>`,
    scripts: ['/src/entry-client.ts'],
  });
}
```

## Content-Security-Policy

Pass `csp: { directives }` to `renderPage`: it sets a `Content-Security-Policy` header whose
`style-src` lists the SHA-256 hash of every shadow component's `<style>` and of the page's
`styles`, built when the page renders (so every component the page uses is registered).
Hashes are cached, so this is cheap per request:

```ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';

const styles = ':root { color-scheme: light dark; }';

export function home(): Response {
  return renderPage({
    title: 'Home',
    styles,
    body: html`<my-home></my-home>`,
    csp: { directives: { 'default-src': "'self'", 'script-src': "'self'" } },
  });
}
```

`await contentSecurityPolicy({ styles, directives })` returns the same header ahead of time,
for the components registered when it is called: import them first (in development
`renderPage` warns when a header it is given lacks a registered component's hash).

Hand-written `<style>` in `head` isn't covered: move that CSS into `styles` or a stylesheet.
Inline `style="…"` attributes in server HTML aren't either: a strict `style-src` blocks them
on first paint, and hydration then applies them through the CSSOM (client renders and updates
are never blocked). Put declarations in stylesheets selected by classes or data attributes, and
use inline styles only for custom properties the stylesheet has a fallback for; or allow known
values with `'style-src-attr': "'unsafe-hashes' 'sha256-…'"`.

`@gyral/core/server` also exports `styleHashes()` (every registered shadow component's hash)
and `componentStyles()` (tag → `<style>` text).

**Trusted Types** (client-only apps too): the browser parses template HTML and `raw()` markup
through one policy named `gyral`, created on first use. Under
`'require-trusted-types-for': "'script'"`, allow it in `trusted-types` when you list policies
(`'trusted-types': 'gyral'`, plus your own). The policy trusts its input as the app's own HTML,
so `raw()` still never takes user input.

## Client entry

```text
// src/entry-client.ts — no hydration import: core hydrates each component on its own.
import './components/greeting.js';
```

## Progressive enhancement with `Hydrated`

```ts
import { define, html } from '@gyral/core';

interface State {
  readonly enhanced: boolean;
}
type Msg = never;

export const ShareButton = define<State, Msg>('my-share', {
  init: () => ({ enhanced: false }),
  intent: {},
  update: {
    // Sent once after the first client render: safe to show the JS-only UI now.
    Hydrated: (s) => ({ ...s, enhanced: 'share' in navigator }),
  },
  view: (s) =>
    s.enhanced
      ? html`<button type="button">Share…</button>`
      : html`<a href="mailto:?subject=Look">Share by email</a>`,
});
```

## Static generation and production serving (`@gyral/ssr/static`)

```ts
import { join } from 'node:path';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { clientAssetsFromManifest, prerender, productionServer } from '@gyral/ssr/static';

interface AppOptions {
  readonly clientEntry: string;
  readonly modulepreload?: readonly string[];
  readonly stylesheets?: readonly string[];
}

const createApp = ({ clientEntry, modulepreload = [], stylesheets = [] }: AppOptions) => ({
  fetch: (_request: Request) =>
    renderPage({
      title: 'Home',
      body: html`<my-home></my-home>`,
      scripts: [clientEntry],
      modulepreload, // <link rel="modulepreload"> for the entry's imports and the hydration chunk
      stylesheets, // <link rel="stylesheet"> for the hashed CSS the client entry imports
    }),
});

// Build step (after `vite build` with build.manifest: true into dist/client):
const dist = join(process.cwd(), 'dist');
const assets = await clientAssetsFromManifest(
  join(dist, 'client', '.vite', 'manifest.json'),
  'src/entry-client.ts',
);
await prerender({
  app: createApp({
    clientEntry: assets.entry,
    modulepreload: assets.modulepreload,
    stylesheets: assets.css,
  }),
  paths: ['/'],
  outDir: join(dist, 'static'),
});

// Production: hashed assets (immutable), prerendered pages (revalidate), the rest per request.
export const server = await productionServer({ distDir: dist, createApp });
```

`prerender` fails the build on any non-200 page. Mount `server.fetch` in your HTTP server.
`productionServer` passes `{ clientEntry, modulepreload, stylesheets }` to `createApp`.
Hydration code loads lazily (only pages with server-rendered components need it); passing
`modulepreload` on to `renderPage` lets the browser fetch it together with the entry instead of
a round trip later. A page whose route module is imported lazily spreads
`assets(['src/routes/product.ts'])` (also given to `createApp`) into `renderPage` instead:
`{ modulepreload, stylesheets }` with that module, its imports and its CSS added
(`clientAssets(manifest, entry, also)` underneath; `preload(modules)` is the `modulepreload`
half alone). `clientEntryFromManifest()` (the entry URL alone) still works.

**Hashed stylesheets.** Import the app's global CSS from the client entry
(`import './app.css';`), so Vite bundles it into a content-hashed file listed in the manifest;
`clientAssets(...).css` (`stylesheets` in `createApp`) lists those files, and
`renderPage({ stylesheets })` links them before any inline `styles`. They are served immutable
from `/assets/`, cached across pages, and `style-src 'self'` allows them without hashes. Use
`styles` (inline, hashed for CSP) only for small critical CSS.

`productionServer` options: `assetsDir` (served at `/assets/`, default `dist/client/assets`),
`staticDir` (prerendered pages, default `dist/static`; `false` when nothing is prerendered, so
page requests skip the file lookup) and `cache` (keep assets in memory, default on, bounded).
Assets answer `GET` and `HEAD` with immutable caching, `content-length` and `nosniff`; a
malformed URL is a 400 and a miss a `no-store` 404 (a CDN must not cache it before the deploy
lands). For a custom server, `assetHandler({ dir, prefix?, cache? })` is the same asset half
alone: it returns `undefined` for paths outside the prefix.

```ts
import { assetHandler } from '@gyral/ssr/static';

// A volume that keeps every release's hashed files, so old tabs still load their chunks.
const assets = assetHandler({ dir: '/srv/assets' });

export async function handle(request: Request): Promise<Response> {
  return (await assets(request)) ?? new Response('Not found', { status: 404 });
}
```

## Serving on Node (`@gyral/ssr/node`)

`toNodeListener(fetch, { origin?, onError? })` mounts any fetch handler on `node:http`, so a
Node server needs no Hono or adapter of its own. The `Request` carries the method, headers, a
streamed body and a `signal` that aborts when the client disconnects; the `Response` body is
written with backpressure (a slow client slows the render; one that leaves cancels it); `HEAD`
sends headers only; each `set-cookie` stays separate; a throwing handler is a 500.

The handler's second argument is `{ incoming, remoteAddress }` (the Node request and the
client's IP address), for rate limits, logs and audits. A Hono app gets it as `c.env`, so
`getConnInfo(c)` from `@hono/node-server/conninfo` works. Behind a proxy `remoteAddress` is the
proxy: read `X-Forwarded-For` only when the request came from a proxy you run.

```ts
import { createServer } from 'node:http';
import { toNodeListener } from '@gyral/ssr/node';

const hits = new Map<string, number>();
createServer(
  toNodeListener((_request, { remoteAddress }) => {
    const client = remoteAddress ?? 'unknown';
    const count = (hits.get(client) ?? 0) + 1;
    hits.set(client, count);
    return count > 100 ? new Response('Slow down', { status: 429 }) : new Response('ok');
  }),
).listen(3000);
```

```ts
import { createServer } from 'node:http';
import { join } from 'node:path';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { toNodeListener } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';

const app = await productionServer({
  distDir: join(process.cwd(), 'dist'),
  staticDir: false, // nothing prerendered: every page renders per request
  createApp: ({ clientEntry, modulepreload, stylesheets }) => ({
    fetch: (_request: Request) =>
      renderPage({
        title: 'Home',
        body: html`<my-home></my-home>`,
        scripts: [clientEntry],
        modulepreload,
        stylesheets,
      }),
  }),
});

// origin: the public origin request URLs are built on (default: the Host header).
createServer(toNodeListener(app.fetch, { origin: 'https://example.com' })).listen(3000);
```

## Islands: hydrate later

`define(tag, { hydrate: 'idle' | 'visible' | 'interaction', … })` makes a server-rendered
instance hydrate when the browser is idle, when it scrolls into view, or on first
pointer/focus (the server writes `defer-hydration` and `data-gyral-hydrate`). Use it for
below-the-fold or rarely used widgets; islands may sit anywhere, also inside other components.
Only the island waits: components nested in its view hydrate on their own at load.
Client-only renders are unaffected.

## Light DOM pages

Page-level components (`shadow: false`) render their content as plain children: crawlers and
document CSS see it, and hydration adopts it in place. Keep widgets in shadow DOM. See
components.md.

## Stores on the server

Create store instances **per request** and pass them to `renderPage({ stores })`; the page
carries one store seed the client restores before components hydrate. Give stores a `schema`
to validate that seed in the browser.

## Preloads under a service worker

Chrome 152–153 may warn "preload … not used because it is a cross-world service worker
resource mismatch" and fetch the module again from the worker when DevTools or a test driver
is attached. It is a browser bug, fixed in Chrome 154; the page works the same. If your tests
run Playwright's bundled Chromium, upgrade to a build ≥ 154.

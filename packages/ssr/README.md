# @gyral/ssr

Gyral server rendering: whole pages of Gyral components rendered on the server (shadow components as Declarative Shadow DOM, light components as plain children), with hydration seeds so the browser picks up where the server left off. Rendering is `@gyral/core/server`'s: synchronous, no DOM, no Node-only APIs. Works in any runtime with the Fetch API `Response` (Node, Hono, Deno, workers).

## Install

```sh
pnpm add @gyral/ssr @gyral/core
```

Hydration is built into `@gyral/core`
([view/07-hydration.md](https://github.com/gyraljs/gyral/blob/main/docs/design-docs/view/07-hydration.md)):
the client entry imports the components and each one adopts the server's DOM in place.

## Example

```ts
// server.ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import './app.js'; // defines <my-app>

export const handle = (req: Request): Response =>
  renderPage({
    title: 'My app',
    body: html`<my-app path=${new URL(req.url).pathname}></my-app>`,
    scripts: ['/client.js'],
  });

// client.ts: hydration is built into @gyral/core
import './app.js';
```

`renderPage` writes the status and headers first, then the body in chunks pulled from a synchronous render, one component boundary per pull (a slow reader slows the render, a cancelled body stops it). Load data before rendering: there is no async or suspense streaming, so the head can't go out while data loads.

`renderPage({ …, csp: { directives } })` sets a `Content-Security-Policy` whose `style-src` allows every component's `<style>` and the page's `styles` by hash, built when the page renders, so components imported late are covered. `contentSecurityPolicy({ styles, directives })` returns the same header ahead of time, for the components registered when it is called (development warns if a registered component's hash is missing from a header passed to `renderPage`). `formAction` handles no-JS form posts with the same schema as the browser.

`@gyral/ssr/static` prerenders pages to static files (SSG) and serves built apps in production (`prerender`, `productionServer`). Its `clientAssetsFromManifest()` reads Vite's manifest for the entry URL and the chunks to preload (its imports and the lazily loaded hydration chunk); pass them as `renderPage({ scripts: [entry], modulepreload })` so server-rendered pages hydrate without extra round trips. CSS imported by the client entry comes back hashed as `css`: pass it as `renderPage({ stylesheets })` for `<link rel="stylesheet">` elements (served immutable, allowed by `style-src 'self'`). A route whose module is imported lazily adds it with `clientAssets(manifest, entry, also)`, or `assets(modules)` from `productionServer`'s `createApp` options (`{ modulepreload, stylesheets }` to spread into `renderPage`).

`productionServer` serves `/assets/*` from `assetsDir` (default `dist/client/assets`) through `assetHandler`: `GET` and `HEAD`, immutable caching, a `content-type` per file type, `content-length`, `nosniff`, traversal and dot-path refusal, a 400 for malformed escapes and `no-store` 404s, so a CDN never keeps a miss. Files stay in memory (bounded; `cache: false` to read from disk). Apps with no prerendered pages pass `staticDir: false`. `assetHandler({ dir, prefix, cache })` also works alone, for example for a volume that keeps every release's hashed files so tabs opened before a deploy still load theirs.

`@gyral/ssr/node` mounts any fetch handler on `node:http`: `createServer(toNodeListener(app.fetch, { origin }))`. Request bodies stream in, response bodies stream out with backpressure, a client that disconnects aborts `request.signal` and cancels the body, `HEAD` sends headers only and each `set-cookie` stays separate. The handler also receives `{ incoming, remoteAddress }` (the Node request and the client's address; Hono's `getConnInfo` reads it as `c.env`).

```ts
// server/prod.ts
import { createServer } from 'node:http';
import { toNodeListener } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';
import { createApp } from './app.js'; // ({ clientEntry, modulepreload, stylesheets }) => { fetch }

const app = await productionServer({ distDir: 'dist', createApp });
createServer(toNodeListener(app.fetch, { origin: 'https://example.com' })).listen(3000);
```

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, server rendering):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral). Upgrading from 0.2:
[docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

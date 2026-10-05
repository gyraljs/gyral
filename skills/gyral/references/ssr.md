# Server rendering and hydration

The server renders the same components to HTML: shadow components as Declarative Shadow DOM
(`<template shadowrootmode>`), light components (`shadow: false`) as plain children. Each
element carries a hydration seed (its state and props as JSON). In the browser, Lit's hydrate
support adopts the existing DOM **in place** (no re-render, no flicker), then `init`'s
commands run and intents go live. Pages work before JavaScript loads.

## Rules

1. **Render synchronously from props and stores.** Components never fetch during the server
   render; commands don't run on the server. Load data in the request handler and pass it in
   (props, or store instances via `renderPage({ stores })`). After hydration, `init`'s
   commands run in the browser.
2. **Client entry order is load-bearing:** `import '@gyral/ssr/hydrate'` first, then
   components. Wrong order breaks hydration silently.
3. **State, props and store state are JSON-serializable** (they're the seed). Never put
   secrets (passwords, tokens) in state.
4. **Boolean form state uses `?checked=${liveBoolean(x)}`**, not `.checked=${x}`.
5. **Server and client must render the same markup for the same state.** Don't branch on
   `typeof window`, dates or randomness in a view; for JS-only UI, render the no-JS version
   first and switch in the `Hydrated` reducer.
6. **CSP:** Declarative Shadow DOM styles are inline `<style>` elements: allow
   `style-src 'self' 'unsafe-inline'`. Scripts stay `script-src 'self'` (seeds are JSON data
   blocks).

## Request handler

`renderPage(options, init?)` returns a streaming `Response` for a full document. It works with
any framework that speaks `fetch` (Hono, Node adapters, Workers):

```ts
import { html } from 'lit';
import { renderPage, serverHtml } from '@gyral/ssr';

export function home(request: Request): Response {
  const name = new URL(request.url).searchParams.get('name') ?? 'world';
  return renderPage({
    title: 'Home — My app',
    description: 'Server-rendered with Gyral.',
    lang: 'en',
    head: serverHtml`<link rel="icon" href="/favicon.svg" />`,
    styles: ':root { color-scheme: light dark; }', // trusted CSS only
    body: html`<my-greeting name=${name}></my-greeting>`,
    scripts: ['/src/entry-client.ts'], // the built asset URL in production
  });
}
```

`serverHtml` is for server-only markup (head content); the hydratable `body` uses Lit's `html`.
Also available: `page(options)` (the document template), `renderToString(value, { stores })`
and `renderToStream(value, { stores })`.

## Client entry

```text
// src/entry-client.ts — ORDER MATTERS: hydrate support before anything that imports lit or @gyral/core.
import '@gyral/ssr/hydrate';
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
import { clientEntryFromManifest, prerender, productionServer } from '@gyral/ssr/static';
import { renderPage } from '@gyral/ssr';
import { html } from 'lit';

const createApp = ({ clientEntry }: { readonly clientEntry: string }) => ({
  fetch: (_request: Request) =>
    renderPage({ title: 'Home', body: html`<my-home></my-home>`, scripts: [clientEntry] }),
});

// Build step (after `vite build` with build.manifest: true into dist/client):
const dist = join(process.cwd(), 'dist');
const clientEntry = await clientEntryFromManifest(
  join(dist, 'client', '.vite', 'manifest.json'),
  'src/entry-client.ts',
);
await prerender({ app: createApp({ clientEntry }), paths: ['/'], outDir: join(dist, 'static') });

// Production: hashed assets (immutable), prerendered pages (revalidate), the rest per request.
export const server = await productionServer({ distDir: dist, createApp });
```

`prerender` fails the build on any non-200 page. Mount `server.fetch` in your HTTP server.

## Islands: hydrate later

`define(tag, { hydrate: 'idle' | 'visible' | 'interaction', … })` makes a server-rendered
instance hydrate when the browser is idle, when it scrolls into view, or on first
pointer/focus. Use it for below-the-fold or rarely used widgets. Client-only renders are
unaffected.

## Light DOM pages

Page-level components (`shadow: false`) render their content as plain children: crawlers and
document CSS see it, hydration still happens in place. Keep widgets in shadow DOM. See
components.md.

## Stores on the server

Create store instances **per request** and pass them to `renderPage({ stores })`; the page
carries one store seed the client restores before components hydrate. Give stores a `schema`
to validate that seed in the browser.

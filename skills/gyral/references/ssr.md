# Server rendering and hydration

> **0.3 status: in progress.** Gyral 0.3 replaces Lit with its own view layer. Server
> rendering moves to `@gyral/core/server` (spec: docs/design-docs/view/06-server.md) and
> hydration into core itself (view/07-hydration.md). Until both land, `@gyral/ssr` keeps its
> API (`renderPage`, `page`, `renderToString`, `renderToStream`, `formAction`,
> `@gyral/ssr/static`) but its rendering is being rewritten, and a host that the browser finds
> with a `data-gyral-seed` resumes its state and props from the seed, then renders fresh
> instead of hydrating. Write components by the rules below; they are what the new renderer
> and hydration rely on.

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
   first and switch in the `Hydrated` reducer. A mismatch throws in development and, in
   production, re-renders only that component.
6. **CSP:** scripts stay `script-src 'self'` (seeds are attributes, not scripts). The 0.3
   server renderer hashes each component's CSS (`styleHashes()`) so `style-src` needs no
   `'unsafe-inline'`.

## Request handler

`renderPage(options, init?)` returns a streaming `Response` for a full document. It works with
any framework that speaks `fetch` (Hono, Node adapters, Workers). Templates are core's `html`:

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
and `renderToStream(value, { stores })`.

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
import { clientEntryFromManifest, prerender, productionServer } from '@gyral/ssr/static';

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
pointer/focus (the server writes `defer-hydration` and `data-gyral-hydrate`). Use it for
below-the-fold or rarely used widgets; islands may sit anywhere, also inside other components.
Client-only renders are unaffected.

## Light DOM pages

Page-level components (`shadow: false`) render their content as plain children: crawlers and
document CSS see it, and hydration adopts it in place. Keep widgets in shadow DOM. See
components.md.

## Stores on the server

Create store instances **per request** and pass them to `renderPage({ stores })`; the page
carries one store seed the client restores before components hydrate. Give stores a `schema`
to validate that seed in the browser.

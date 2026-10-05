# @gyral/ssr

Gyral server rendering: whole pages of Gyral components rendered to Declarative Shadow DOM on the server, with hydration seeds so the browser picks up where the server left off. Works in any runtime with the Fetch API `Response` (Node, Hono, workers).

## Install

```sh
pnpm add @gyral/ssr @gyral/core lit @lit-labs/ssr @lit-labs/ssr-client
```

## Example

```ts
// server.ts
import { html } from 'lit';
import { renderPage } from '@gyral/ssr';
import './app.js'; // defines <my-app>

export const handle = (req: Request): Response =>
  renderPage({
    title: 'My app',
    body: html`<my-app path=${new URL(req.url).pathname}></my-app>`,
    scripts: ['/client.js'],
  });

// client.ts: import the hydration support first
import '@gyral/ssr/hydrate';
import './app.js';
```

`@gyral/ssr/static` prerenders pages to static files (SSG) and serves built apps in production (`prerender`, `productionServer`).

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © The Zoop Troop, Inc. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of The Zoop Troop, Inc.

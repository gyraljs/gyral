# @gyral/ssr

Gyral server rendering: whole pages of Gyral components rendered to Declarative Shadow DOM on the server, with hydration seeds so the browser picks up where the server left off. Works in any runtime with the Fetch API `Response` (Node, Hono, workers).

## Install

```sh
pnpm add @gyral/ssr @gyral/core
```

> **0.3.0 in progress:** server rendering is being rebuilt on Gyral's own view layer
> (`@gyral/core/server`, docs/design-docs/view/06-server.md). Until it lands, `renderPage`,
> `renderToStream` and `renderToString` throw; `formAction`, `page()` and the static helpers
> keep their API.

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

`@gyral/ssr/static` prerenders pages to static files (SSG) and serves built apps in production (`prerender`, `productionServer`).

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

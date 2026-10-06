# @gyral/ssr

Gyral server rendering: whole pages of Gyral components rendered on the server (shadow components as Declarative Shadow DOM, light components as plain children), with hydration seeds so the browser picks up where the server left off. Rendering is `@gyral/core/server`'s: synchronous, no DOM, no Node-only APIs. Works in any runtime with the Fetch API `Response` (Node, Hono, Deno, workers).

## Install

```sh
pnpm add @gyral/ssr @gyral/core
```

Hydration is built into `@gyral/core` (docs/design-docs/view/07-hydration.md): the client
entry imports the components and each one adopts the server's DOM in place.

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

`contentSecurityPolicy({ styles, directives })` builds a `Content-Security-Policy` whose `style-src` allows every component's `<style>` by hash; pass it as `renderPage({ …, csp })`. `formAction` handles no-JS form posts with the same schema as the browser.

`@gyral/ssr/static` prerenders pages to static files (SSG) and serves built apps in production (`prerender`, `productionServer`).

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

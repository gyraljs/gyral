# @gyral/router

The Gyral router: typed route tables, navigation as commands, and the History API as the baseline with the Navigation API as an enhancement. Route tables are pure, so the same table matches paths on the server.

## Install

```sh
pnpm add @gyral/router @gyral/core
```

## Example

```ts
import { navigate, routes } from '@gyral/router';

export const site = routes({ home: '/', product: '/products/:id' });

site.match('/products/42/'); // { name: 'product', params: { id: '42' }, path: '/products/42' }

// In an update: [state, [navigate('/products/42')]]
// Filters in the URL, without a new history entry; a replace doesn't move scroll or focus:
// [state, [navigate('?q=shoes&sort=price', { replace: true })]]
```

`setHead(head)` makes the document's head (title, description, canonical, robots, meta, links,
JSON-LD, `lang`, `dir`) match a `Head` after a navigation: pass it the same value the server
gives `page()` / `renderPage()` (from `@gyral/ssr`), so a client navigation leaves the same head
as a page load.

After a push renders, the router scrolls to the `#fragment` target or the top, restores the
position on back and forward, and resets focus; pass `scroll: false` / `focusReset: false` to
`navigate` or `makeRouter` to manage them yourself. A `replace` leaves scroll and focus alone
unless you pass `scroll: true` / `focusReset: true`.

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, server rendering):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral). Upgrading from 0.2:
[docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

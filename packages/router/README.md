# @gyral/router

The Gyral router: typed route tables, navigation as commands, and the History API as the baseline with the Navigation API as an enhancement. Route tables are pure, so the same table matches paths on the server.

## Install

```sh
pnpm add @gyral/router @gyral/core lit
```

## Example

```ts
import { navigate, routes } from '@gyral/router';

export const site = routes({ home: '/', product: '/products/:id' });

site.match('/products/42'); // { name: 'product', params: { id: '42' } }

// In an update: [state, [navigate('/products/42')]]
```

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © The Zoop Troop, Inc. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of The Zoop Troop, Inc.

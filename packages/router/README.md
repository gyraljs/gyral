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

site.match('/products/42'); // { name: 'product', params: { id: '42' } }

// In an update: [state, [navigate('/products/42')]]
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

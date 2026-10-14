# @gyral/core

Model-View-Intent web components on the web platform, with their own view layer. Intent parses platform events into typed messages, the model is a set of pure reducers, and the view is a pure template that names intents. Side effects are commands: data that drivers run at the edges.

## Install

```sh
pnpm add @gyral/core
```

## Example

```ts
import { define, html } from '@gyral/core';

type Msg = { _tag: 'Increment' } | { _tag: 'Decrement' };

define<{ count: number }, Msg>()('gy-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: true,
    Decrement: true,
  },
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
  view: (s, i) => html`
    <output>${s.count}</output>
    <button type="button" data-intent=${i.Decrement}>Decrement</button>
    <button type="button" data-intent=${i.Increment}>Increment</button>
  `,
});
```

`@gyral/core/vite` exports `gyralVitePreset()`, the Vite/Vitest settings every Gyral app needs
(the build-time template compiler). `@gyral/core/eslint` is an ESLint plugin with the same
template rules for the editor (`import gyral from '@gyral/core/eslint'`, then
`gyral.configs.recommended` in your flat config). `@gyral/ssr` renders components and pages
to HTML on the server. In tests, `await settled()` waits until
every component has rendered and messages have stopped arriving.

## Documentation

`@gyral/core/storage` exports `makeLocalStorageDriver(schema, { prefix?, name?,
storage?, encode? })`: JSON Read/Write/Remove/Clear commands and cancellable Watch streams.
Reads validate persisted values with Standard Schema; watches report invalid data and keep
listening. Driver writes and native other-tab events produce changes. Clear respects the
prefix namespace. Start initial watches in `subscriptions` so SSR state hydrates first;
imports and factories do not access browser globals. This optional entry is absent from
apps that do not import it. See [the storage guide](https://github.com/gyraljs/gyral/blob/main/skills/gyral/references/browser-storage.md).

`@gyral/core/indexeddb` exports `makeIndexedDBDriver(stores, { database, version,
upgrade?, name?, factory?, encode? })`: typed Read/Put/Delete, bounded Query and atomic
Transaction batches. Applications own stores, indexes and synchronous migrations. Success
means the native transaction committed; stored records decode afterward. Blocked upgrades,
access and decoding failures are typed. Commands close connections and cancel native work;
an already committed write cannot be undone. This entry is also optional and SSR-safe.

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, template compiler):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: 0.x, on npm. Breaking changes to the
> [public API](https://github.com/gyraljs/gyral/blob/main/docs/references/public-api-0.3.1.md)
> come only in a new minor version, with a migration guide.

## Diagnostic codes

Production builds print codes such as `Gyral G0010 my-cart Increment`. The full table (code,
group, message, arguments, link) ships with the package as `@gyral/core/errors.json`, for tools
and docs sites: `import errors from '@gyral/core/errors.json' with { type: 'json' };`. The
same table, rendered: <https://gyral.dev/errors/>.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

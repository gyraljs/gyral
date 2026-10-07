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

define<{ count: number }, Msg>('gy-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
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
`gyral.configs.recommended` in your flat config). `@gyral/core/server` renders components to
HTML on the server (`@gyral/ssr` builds pages on it). In tests, `await settled()` waits until
every component has rendered.

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, template compiler):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral). Upgrading from 0.2:
[docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

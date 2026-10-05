# @gyral/core

Model-View-Intent web components on [Lit](https://lit.dev) and the web platform. _Inspired by [Cycle.js](https://cycle.js.org)._ Intent parses platform events into typed messages, the model is a set of pure reducers, and the view is a pure template that names intents. Side effects are commands: data that drivers run at the edges.

## Install

```sh
pnpm add @gyral/core lit
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
(one copy of Lit, Lit modules pre-bundled).

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

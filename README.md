# Gyral

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@gyral/core?label=%40gyral%2Fcore)](https://www.npmjs.com/package/@gyral/core)
[![npm provenance](https://img.shields.io/badge/npm-provenance-2ea44f?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)

**Model-View-Intent web components on the modern web platform.**
_Inspired by [Cycle.js](https://cycle.js.org)._

Gyral keeps the core idea of Cycle.js (your app is a pure function, side effects happen at
the edges as data, and data flows in one visible loop) and rebuilds it on today's platform:
custom elements and Shadow DOM, [Lit](https://lit.dev) templates, semantic HTML, modern CSS.
No stream library to learn.

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

- **Intent** parses platform events (clicks, form submissions, input) into typed messages.
- **Model** is a set of pure reducers, one per message, so it is exhaustive by type.
- **View** is a pure template that _names_ intents. It holds no event-handler closures.

> Status: pre-alpha. The work plan lives in [beads](https://github.com/gastownhall/beads)
> (`bd ready`); architecture is in [ARCHITECTURE.md](ARCHITECTURE.md), decisions in
> [docs/design-docs](docs/design-docs/index.md).

Using Gyral in your own app (peer dependencies, Vite dedupe, SSR checklist):
[docs/references/consumer-setup.md](docs/references/consumer-setup.md).

## Development

```sh
pnpm install
pnpm exec playwright install chromium
pnpm check                                   # the full gate
pnpm examples                                # run every example; index at http://localhost:5100
pnpm --filter @gyral-examples/counter dev    # run an example
pnpm ci:local                                # run CI locally (Docker + gh act)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (commits need a DCO sign-off, `git commit -s`), the
[Code of Conduct](CODE_OF_CONDUCT.md) and the [security policy](SECURITY.md). Releases:
[docs/references/releasing.md](docs/references/releasing.md).

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE) (Cycle.js attribution).

Gyral, gyraljs and the Gyral logo are trademarks of The Zoop Troop, Inc. Logos and usage
guidelines: [gyraljs/brand](https://github.com/gyraljs/brand).

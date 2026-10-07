# @gyral/time

Gyral time: delays, debounces, periodic ticks and animation frames as commands, so timing logic stays in pure update functions and tests run on virtual time.

## Install

```sh
pnpm add @gyral/time @gyral/core
```

## Example

```ts
import { debounce, delay } from '@gyral/time';

// In an update:
//   Typed: (s, m) => [{ ...s, query: m.text }, [debounce(300, { _tag: 'Search' })]],
//   Saved: (s) => [{ ...s, toast: true }, [delay(2000, { _tag: 'HideToast' })]],
```

Apps that only need delays and debounces import them from `@gyral/time/delay`: the same
`delay` and `debounce`, over a delay-only driver (also named `time`), so periodic ticks and
animation frames stay out of the bundle.

```ts
import { debounce, delay } from '@gyral/time/delay';
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

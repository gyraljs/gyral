# @gyral/time

Gyral time: delays, debounces, wall-clock ticks (`every`) and animation frames as commands, so timing logic stays in pure update functions and tests run on virtual time.

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

`delay` and `debounce` run on a delay-only driver (also named `time`, so tests substitute it
the same way), so an app that only delays doesn't bundle the `every` code.

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, server rendering):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral). Upgrading from 0.2:
[docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

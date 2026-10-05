# @gyral/time

Gyral time: delays, debounces, periodic ticks and animation frames as commands, so timing logic stays in pure update functions and tests run on virtual time.

## Install

```sh
pnpm add @gyral/time @gyral/core lit
```

## Example

```ts
import { debounce, delay } from '@gyral/time';

// In an update:
//   Typed: (s, m) => [{ ...s, query: m.text }, [debounce(300, { _tag: 'Search' })]],
//   Saved: (s) => [{ ...s, toast: true }, [delay(2000, { _tag: 'HideToast' })]],
```

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

# @gyral/testing

Gyral test helpers: step pure updates, inspect commands, fake drivers, virtual time, mount server-rendered pages, and generate inputs from schemas. Works with any test runner; examples use Vitest.

## Install

```sh
pnpm add -D @gyral/testing
```

## Example

```ts
import { expect, test } from 'vitest';
import { step } from '@gyral/testing';
import { Counter } from '../src/counter.js';

test('increment', () => {
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Increment' }).state).toEqual({ count: 2 });
});
```

`@gyral/testing/arbitraries` derives [fast-check](https://fast-check.dev) arbitraries from schemas (install `fast-check` to use it).

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

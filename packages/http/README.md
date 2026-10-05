# @gyral/http

The Gyral HTTP driver: fetch requests as commands, typed errors (`HttpStatusError`, `HttpNetworkError`, `HttpDecodeError`), and response decoding with any [Standard Schema](https://standardschema.dev) library (Valibot, Zod, ArkType).

## Install

```sh
pnpm add @gyral/http @gyral/core lit
```

## Example

```ts
import type { Command } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import * as v from 'valibot';

const User = v.object({ id: v.number(), name: v.string() });

export const fetchUser = <M>(
  id: number,
  onSuccess: (user: v.InferOutput<typeof User>) => M,
  onFailure: (error: HttpError) => M,
): Command<M> =>
  get(`/api/users/${id}`, {
    schema: User,
    key: 'users',
    concurrency: 'switch',
    onSuccess,
    onFailure,
  });

// Return it from an update: [state, [fetchUser(id, toLoaded, toFailed)]]
```

`@gyral/http/testing` exports `fakeHttp`, a scripted HTTP driver for tests.

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (peer dependencies, Vite preset, SSR checklist):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © The Zoop Troop, Inc. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of The Zoop Troop, Inc.

# @gyral/http

The Gyral HTTP driver: fetch requests as commands, typed errors (`HttpStatusError`, `HttpNetworkError`, `HttpDecodeError`), and response decoding with any [Standard Schema](https://standardschema.dev) library (Valibot, Zod, ArkType).

## Install

```sh
pnpm add @gyral/http @gyral/core
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

`@gyral/http/sse` exports `makeEventSourceDriver(schema, { events?, withCredentials?,
parse?, name? })`. It decodes default/named events, preserves event IDs, reports connection
states and typed decoding/terminal failures, and cleans up on cancellation. Native
EventSource owns GET/cookies/reconnection/Last-Event-ID; there is no headers/POST transport
or extra retry loop. Imports/factories are SSR-safe. The fetch entry does not bundle it.
See [the network feed guide](https://github.com/gyraljs/gyral/blob/main/skills/gyral/references/network-streams.md).

`@gyral/http/websocket` exports `makeWebSocketDriver(schema, { encode, parse?, name?,
maxBufferedBytes? })`: Connect streams and Send/Close commands on explicitly owned native
sockets. Incoming data is decoded; outgoing buffering is bounded (64 KiB by default), with
typed failures and native close metadata. Send success means browser enqueue. Reconnect
through `retry()` explicitly; there is no offline queue or replay. Normal/intentional closes
complete, and cancellation cleans up. The entry is optional and imports/factories are SSR-safe.

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, server rendering):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral).

> Status: 0.x, on npm. Breaking changes to the
> [public API](https://github.com/gyraljs/gyral/blob/main/docs/references/public-api-0.3.1.md)
> come only in a new minor version, with a migration guide.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

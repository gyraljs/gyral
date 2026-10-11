# Native network feeds (0.3.1)

Optional `@gyral/http/sse` and `@gyral/http/websocket` entries use browser-native transports.
They are separate from the fetch entry, add no runtime dependencies, and open no resources
on import or factory creation. Use normal commands, declarative subscriptions and fake
substitution by driver name. Feeds start after the first render, preserving SSR seeds.

## Server-sent events

```ts
import { command, define, html } from '@gyral/core';
import {
  makeEventSourceDriver,
  type EventSourceError,
  type EventSourceOutput,
} from '@gyral/http/sse';
import * as v from 'valibot';

const schema = v.object({ count: v.number() });
const feed = makeEventSourceDriver(schema, { events: ['count'], withCredentials: false });
type Msg =
  | { readonly _tag: 'Feed'; readonly value: EventSourceOutput<v.InferOutput<typeof schema>> }
  | { readonly _tag: 'Failed'; readonly error: EventSourceError };
interface State {
  readonly count: number;
  readonly status: string;
}
export const Counter = define<State, Msg>()('my-server-count', {
  init: () => ({ count: 0, status: 'connecting' }),
  subscriptions: () => [
    command(
      feed,
      { url: '/events' },
      {
        onSuccess: (value) => ({ _tag: 'Feed', value }),
        onFailure: (error) => ({ _tag: 'Failed', error }),
      },
    ),
  ],
  update: {
    Feed: (s, m) => {
      switch (m.value._tag) {
        case 'EventSourceMessage':
          return { ...s, count: m.value.data.count };
        case 'EventSourceState':
          return { ...s, status: m.value.state };
        case 'EventSourceDecodeFailed':
          return { ...s, status: 'invalid event' };
      }
    },
    Failed: (s) => ({ ...s, status: 'closed' }),
  },
  view: (s) =>
    html`<output>${s.count}</output>
      <p role="status">${s.status}</p>`,
});
```

The driver always observes `message` and adds configured named events (no wildcard native
listener). `EventSourceMessage` preserves `eventType` and `lastEventId`; empty IDs are valid.
Default parsing is JSON followed by Standard Schema validation. Use `parse(text)` for another
text format. Async decoders preserve arrival order. Bad JSON/schema data emits
`EventSourceDecodeFailed { issues, eventType, lastEventId }` without ending the connection.

Native EventSource owns GET requests, cookie credentials, reconnection, server `retry:`
timing and Last-Event-ID. `withCredentials` configures cross-origin credentials; same-origin
cookies follow native behavior. CONNECTING errors report connecting state and keep the same
source. Terminal CLOSED errors report closed state and reject with `EventSourceError` through
`onFailure`; detailed HTTP status/body are unavailable. The driver adds no second retry loop.
Abort removes listeners, closes the source and suppresses pending decoded results.

Headers, POST streams and fetch-based transports are outside this driver. Event IDs do not
guarantee exactly-once delivery or replay; handle deduplication/resynchronization in your
protocol. Tests use `fakeDriver(feed)` with `el.drivers = { sse: fake }` (or the configured
name) and `fake.emitNext(...)` to deliver events/states.

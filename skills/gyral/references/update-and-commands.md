# Update and commands

`update` maps every message tag to a pure reducer `(state, msg, ctx) => Next<S, M>`, where

```text
Next<S, M> = S | readonly [S, ReadonlyArray<Command<M | IntentRejected>>]
```

Return the next state alone, or a tuple of state and commands. State is never an array (that
is how Gyral tells the two apart), so wrap list state in an object: `{ items: [...] }`.

`init(props)` returns a `Next` too: start loading data or listening to the router from `init`.

## Commands are data

A command describes a side effect and maps its outcome back to messages. Gyral runs it after
the reducer returns, through a driver, and dispatches the resulting message to the same
component. The reducer itself never awaits anything.

```ts
import { define, html } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import * as v from 'valibot';

const User = v.object({ id: v.number(), name: v.string() });
type User = v.InferOutput<typeof User>;

type State =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Loaded'; readonly user: User }
  | { readonly _tag: 'Failed'; readonly reason: string };

type Msg =
  | { readonly _tag: 'Reload' }
  | { readonly _tag: 'Got'; readonly user: User }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const load = () =>
  get('/api/user/1', {
    schema: User,
    key: 'user',
    concurrency: 'switch',
    onSuccess: (user): Msg => ({ _tag: 'Got', user }),
    onFailure: (error): Msg => ({ _tag: 'Failed', error }),
  });

export const Profile = define<State, Msg>('my-profile', {
  init: () => [{ _tag: 'Loading' }, [load()]],
  intent: { Reload: () => ({ _tag: 'Reload' }) },
  update: {
    Reload: () => [{ _tag: 'Loading' }, [load()]],
    Got: (_s, m) => ({ _tag: 'Loaded', user: m.user }),
    Failed: (_s, m) => ({ _tag: 'Failed', reason: m.error._tag }),
  },
  view: (s, i) => html`
    ${s._tag === 'Loaded' ? html`<h2>${s.user.name}</h2>` : ''}
    ${s._tag === 'Loading' ? html`<p role="status">Loading…</p>` : ''}
    ${s._tag === 'Failed' ? html`<p role="alert">Could not load (${s.reason}).</p>` : ''}
    <button type="button" data-intent=${i.Reload}>Reload</button>
  `,
});
```

Model state as a tagged union (`Loading | Loaded | Failed`) instead of loose booleans: the view
can't show a stale user next to an error.

## Framework messages (optional reducers)

| Message                                      | When                                                             | Use for                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `PropsChanged { props, prev }`               | a declared prop changed after the first render                   | copying props into state, refetching                         |
| `IntentRejected { intent, issues, values? }` | `form()`/`field()` validation failed, or the server answered 422 | showing field errors                                         |
| `StoreChanged { store, state, prev }`        | a store in `spec.stores` changed                                 | reacting to shared state (narrow with `changed(store, msg)`) |
| `Hydrated { serverRendered }`                | once, after the first client render                              | progressive enhancement: switch to the JS-only UI            |

Without a reducer they leave state unchanged (props and stores are still readable via `ctx`).

## Ignoring stale responses

Under `switch` the previous request is aborted, but a response can still race a state change.
Carry the request's key in the message and compare it in the reducer:

```ts
import { define, html } from '@gyral/core';
import { get } from '@gyral/http';

interface State {
  readonly query: string;
  readonly hits: readonly string[];
}
type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Hits'; readonly query: string; readonly hits: readonly string[] };

export const Search = define<State, Msg>('my-search', {
  init: () => ({ query: '', hits: [] }),
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }) },
  update: {
    Typed: (s, m) => [
      { ...s, query: m.query },
      [
        get<{ readonly hits: readonly string[] }, Msg>(
          `/api/search?q=${encodeURIComponent(m.query)}`,
          {
            key: 'search',
            concurrency: 'switch',
            onSuccess: (body) => ({ _tag: 'Hits', query: m.query, hits: body.hits }),
          },
        ),
      ],
    ],
    // Only the answer for the current query counts.
    Hits: (s, m) => (m.query === s.query ? { ...s, hits: m.hits } : s),
  },
  view: (s, i) => html`
    <input type="search" value=${s.query} data-intent=${i.Typed} />
    <ul>
      ${s.hits.map((h) => html`<li>${h}</li>`)}
    </ul>
  `,
});
```

(Without a `schema`, `get<O>` trusts the body's shape; prefer a schema for real APIs.)

## Built-in commands in core

- `emit(output)` — send an output to the parent (child components).
- `send(store, msg)` — write to a store.
- `focus(selector, { preventScroll?, select? })` — focus an element inside this component after
  the render this reducer caused (non-focusable targets need `tabindex="-1"`).
- `random(count, toMsg)`, `randomInt(min, max, toMsg)` — randomness as an effect, so reducers
  stay deterministic and tests feed fixed numbers.

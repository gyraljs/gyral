# ADR 0013 — Shared state: stores as "props from the side"

Status: **proposed** (2026-10-04). Bead: gyral-czi.18. Needed by the e-commerce app (a cart
badge in the header and a checkout page deep in the tree share one cart).

## Context

Gyral components own their state (ADR 0001). State flows down as props (ADR 0007), and
outputs flow up (ADR 0010). That covers parent and child. It does not cover two *distant*
components that need the same data: threading it through every level in between ("prop
drilling") couples unrelated components.

How other frameworks handle it:

| Framework | Shared state | Writes | SSR |
| --- | --- | --- | --- |
| React | Context + `useReducer`, or Redux/Zustand stores | dispatch, or setters | Per-request store, serialized |
| Svelte 5 | Runes in `.svelte.ts` modules, or stores | direct assignment | Module state leaks across requests; use context per request |
| Solid | `createStore` + context | setters | Per-request via context |
| Angular | Injectable services holding signals | methods | DI scope per request |
| Vue | Pinia stores | actions | Per-request Pinia instance, serialized |
| Elm | One model for the whole app | `update` | n/a |
| Cycle.js | `@cycle/state` (onionify): one tree, lenses per component | reducer streams | n/a |

The common thread: a store has its own reducer-style update. Components read it reactively
and write through actions or messages. On the server there is **one store instance per
request**, serialized for hydration.

## Options

- **A. A signal module that views read directly** (`cart.get()` in `view`). The view stops
  being a function of `(state, ctx)`. Writes would be side effects inside reducers. Rejected.
- **B. Lift state to a common ancestor** and drill it down. Works today; doesn't scale to a
  header badge and a checkout page.
- **C. A store driver with streaming subscriptions** (like router `listen()`). Pure, but
  components keep a *copy* of store data in their own state. On the server, commands don't
  run (ADR 0012), so the first render can't see the store.
- **D. Stores as context: "props from the side"** (recommended). This mirrors ADR 0007:
  read through context, react through an optional message, write through commands.

## Proposal (D)

```ts
// state/cart.ts: a store is MVI without a view
export const cart = defineStore<Cart, CartMsg>('cart', {
  init: () => ({ lines: [] }),
  update: {
    Add: (s, m) => ({ lines: [...s.lines, m.line] }),
    Remove: (s, m) => ({ lines: s.lines.filter((l) => l.sku !== m.sku) }),
  },
});

// any component, anywhere in the tree
define<State, Msg, Props>('cart-badge', {
  stores: { cart },                                       // declares what it reads
  view: (s, i, { stores }) => html`<span>${stores.cart.lines.length}</span>`,
  update: {
    AddToCart: (s, m) => [s, [send(cart, { _tag: 'Add', line: m.line })]], // writes are commands
    StoreChanged: (s, m) => …,                            // optional, like PropsChanged
  },
});
```

- **Read:** `ctx.stores.cart` is available in `view` and every reducer, exactly like
  `ctx.props`. It is typed by the `stores` declaration.
- **React:** a store change re-renders its subscribers. An optional
  `StoreChanged { store, state, prev }` reducer lets a component update its own state in
  response (ADR 0007's `PropsChanged`, for stores).
- **Write:** `send(store, msg)` is a command. A store's `update` may return commands (for
  example, persist the cart), run by the store's own interpreter. Stores never touch the DOM.
- **Test:** `store.spec.update` is pure (`step()` works on it). Components get a fresh store
  instance per test (`el.stores = { cart: testStore(cart, initial) }`), the same way
  `el.drivers` substitutes drivers.
- **SSR:** the request handler creates a **per-request** instance
  (`page({ stores: [cart.instance(initial)] })`). Components read it synchronously during the
  server render. `@gyral/ssr` serializes every store's state once in a page-level seed
  (`<script type="application/json" data-gyral-stores>`, script-safe). The client restores it
  before any component hydrates, so first renders match.
- **Scope:** on the client, a store resolves through the DOM ancestry (a `<gyral-stores>`
  provider, or the document by default). Nested providers allow tests and islands to have
  their own instances. On the server, the instance comes from a request-scoped registry that
  `@gyral/ssr` keeps for the duration of the render. The implementation must prove it holds
  across streamed chunks.
- **Persistence and sync** (localStorage, other tabs, server carts) are drivers that a store's
  `update` commands use. They are not built into stores.

## Consequences

- Views stay pure functions of `(state, intents, ctx)`. `ctx` just has a second source.
- One mental model: props from above, stores from the side, both read-only, both with an
  optional "changed" message, writes always as messages.
- A new concept to learn (`defineStore`), but it is the same spec shape as `define()`
  without `view`/`intent`.
- Open: does `StoreChanged` need a selector so a component doesn't re-render on unrelated
  store changes? Decide when performance requires it, with a measurement.

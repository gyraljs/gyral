# ADR 0013 — Shared state: stores as "props from the side"

Status: **accepted** (2026-10-04, approved by the project owner). Bead: gyral-czi.18. Needed by the e-commerce app (a cart
badge in the header and a checkout page deep in the tree share one cart).

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): on the server, Gyral's own renderer keeps the request's store scope (view/06-server.md); the Lit SSR DOM-shim mechanics recorded here are gone. Lit-specific text below describes 0.2.x.

## Context

Gyral components own their state (ADR 0001). State flows down as props (ADR 0007), and
outputs flow up (ADR 0010). That covers parent and child. It does not cover two _distant_
components that need the same data: threading it through every level in between ("prop
drilling") couples unrelated components.

How other frameworks handle it:

| Framework | Shared state                                              | Writes               | SSR                                                         |
| --------- | --------------------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| React     | Context + `useReducer`, or Redux/Zustand stores           | dispatch, or setters | Per-request store, serialized                               |
| Svelte 5  | Runes in `.svelte.ts` modules, or stores                  | direct assignment    | Module state leaks across requests; use context per request |
| Solid     | `createStore` + context                                   | setters              | Per-request via context                                     |
| Angular   | Injectable services holding signals                       | methods              | DI scope per request                                        |
| Vue       | Pinia stores                                              | actions              | Per-request Pinia instance, serialized                      |
| Elm       | One model for the whole app                               | `update`             | n/a                                                         |
| Cycle.js  | `@cycle/state` (onionify): one tree, lenses per component | reducer streams      | n/a                                                         |

The common thread: a store has its own reducer-style update. Components read it reactively
and write through actions or messages. On the server there is **one store instance per
request**, serialized for hydration.

## Options

- **A. A signal module that views read directly** (`cart.get()` in `view`). The view stops
  being a function of `(state, ctx)`. Writes would be side effects inside reducers. Rejected.
- **B. Lift state to a common ancestor** and drill it down. Works today; doesn't scale to a
  header badge and a checkout page.
- **C. A store driver with streaming subscriptions** (like router `listen()`). Pure, but
  components keep a _copy_ of store data in their own state. On the server, commands don't
  run (ADR 0012), so the first render can't see the store.
- **D. Stores as context: "props from the side"** (recommended). This mirrors ADR 0007:
  read through context, react through an optional message, write through commands.

## Decision (D)

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

## Addendum: implementation (gyral-czi.18, 2026-10-04)

Example: `examples/shared-cart`. Code: `packages/core/src/store*.ts`,
`packages/ssr/src/{index,internal/lit}.ts`, `packages/testing/src/stores.ts`.

**One deviation from the sketch above: reads are `ctx.read(cart)`, not `ctx.stores.cart`.**
Components pass their type arguments explicitly (`define<State, Msg>`), and TypeScript has no
partial inference, so typing `ctx.stores` from the `stores` declaration would force a fifth
type argument on every component. `read(store)` takes its type from the argument instead.
The declaration is an array, `stores: [cart]`. Reading a store that isn't declared throws
an error naming the fix, because an undeclared store would never trigger re-renders.

```ts
define<State, Msg>('cart-badge', {
  stores: [cart],
  view: (s, i, { read }) => html`${count(read(cart))}`,
  update: {
    Buy: (s, m) => [s, [send(cart, { _tag: 'Add', product: m.product })]],
    StoreChanged: (s, m) => { const c = changed(cart, m); return c ? { …s } : s; }, // typed narrowing
  },
});
```

- **Store instances:** `cart.instance(initial?)` creates an independent instance with
  `state`, `send`, `subscribe`, `drivers` and `dispose`.
  - It has its own interpreter, created lazily. Commands never run on the server.
  - Subscribers are notified synchronously when state changes (`Object.is`).
  - `send(store, msg)` is a marker command, like `emit()`. A component's `#apply` delivers
    it to the instance that component resolved. Stores cannot `send` to other stores yet.
- **Choosing the instance:** in order,
  1. `el.stores[name]`, a per-element override for tests and islands;
  2. the nearest `<gyral-stores>` ancestor, found through shadow roots. It takes preset
     instances from its `.instances` property, or creates its own on demand. It's a plain
     element tracked in a `WeakMap`, with no class to register, so it is SSR-safe;
  3. the document default.

  A component resolves and subscribes on every connect, so moving it re-resolves.

- **Server scope:**
  - `renderToString(value, { stores })`, `renderToStream(value, { stores })` and
    `renderPage({ …, stores })` build a `StoreRegistry`. Every synchronous step of the Lit SSR
    iterator, including the initial `render()` call, runs inside `withStoreScope(registry, …)`.
  - Components render while the iterator advances, so each request only ever sees its own
    registry. A test proves this by reading two streams alternately, chunk by chunk, plus
    three concurrent pages.
  - This needs no `AsyncLocalStorage`, so it works on any runtime.
  - A store read outside any scope on the server throws an error naming the fix.
- **Page seed:** `page({ stores })` writes
  `<script type="application/json" data-gyral-stores>` from `registry.snapshot()`. The JSON is
  script-safe (`<`, `>`, `&`, U+2028/2029 escaped). The client's document default reads it the
  first time a store is resolved, which happens in `connectedCallback` before the hydrating
  render.
- **Commands of seeded instances:** an instance created with `initial` (from the seed) starts
  its `init` commands in a `setTimeout(0)`, after the hydrating renders. This is the same
  reason ADR 0012 defers component `init` commands.
- **Testing** (`@gyral/testing`):
  - `testStore(store, initial?)` gives a fresh instance for a test.
  - `stepStore(store, state, msg)` runs a store reducer purely.
  - `sentTo(commands, store)` lists the messages a reducer's commands `send()` to that store.
  - `step(spec, state, msg, props, [instances])` and `run(…, { stores })` give reducers a
    working `ctx.read`.
  - `resetDocumentStores()` (core) clears the document default between tests.

## Addendum: seed schemas (gyral-czi.29, 2026-10-04)

`defineStore(name, { …, schema })` takes an optional synchronous Standard Schema for the store's
state. When the client restores a page seed (`<script data-gyral-stores>`), the registry checks
it first: a valid seed becomes the instance's state (with the schema's output, so transforms
apply); an invalid one is reported with `console.error` (store name and every issue path) and
the store starts from `init`. A broken seed is a server bug: the page keeps working, and the
error says exactly what was wrong. `store.checkSeed(value)` exposes the same check.

## Addendum: store-to-store send and provider seeds (gyral-czi.20, 2026-10-04)

**Store-to-store writes.** A store's `update` may return `send(otherStore, msg)`. The registry
that holds an instance binds it to its scope (`bindScope`), and the message is delivered
synchronously to `otherStore`'s instance in that same scope: the page default, a
`<gyral-stores>` provider, or a test registry. An instance outside any scope (a bare
`store.instance()`) warns and drops the message.

**Providers on the server.** `@gyral/ssr` registers `<gyral-stores>` as a server-only element
(`defineStoresProvider()`; a no-op in the browser). Components rendered inside it find it by
dispatching `gyral-stores-request`. Lit's SSR DOM shim bubbles events through the custom
elements being rendered (the mechanism `@lit/context` uses). Setting `.instances` writes their
states to the provider's `data-gyral-stores` attribute; stores not listed start from `init` on
both sides. Two Lit SSR (4.1) details shaped this:

- A slotted child's event path is `child → slot → slot.getRootNode() → host`, and the root is the
  host's shadow root only if one was attached. The renderer never calls `connectedCallback`, so
  the provider attaches its shadow root in its constructor.
- `LitElementRenderer.renderOptions` `disableSsr` can't be used: when `renderShadow()` returns
  `undefined`, `render-value.js` pushes the element onto `customElementHostStack` and never pops
  it. The provider's children, and its later siblings, would be treated as inside its shadow root.

**Providers on the client.** A server-rendered provider stays a plain element whose shadow root
is just `<slot>`. On first use its scope reads `data-gyral-stores`. Seeded stores are restored
from it, and win over instances passed in `.instances`, so hydration matches the server.
`.instances` supplies the rest.

## Addendum: the Gyral server renderer (gyral-g1r.9, 2026-10-06)

Behaviour is unchanged; the mechanism follows the new renderer (view/06-server.md):

- **Per-step scope:** `@gyral/core/server`'s `render` yields at every component boundary and
  runs each component's `init` and view in the step that writes it. `@gyral/ssr` wraps every
  step (each `ReadableStream` pull, and the whole of `renderToString`) in
  `withStoreScope(registry, …)`. The interleaved-streams and concurrent-pages tests still prove
  isolation.
- **Providers:** `<gyral-stores>` is a server _provider_ registered with the renderer, not an
  element that receives bubbling events. Its registry is passed down the walk to every
  component inside it (`ServerRenderInput.scope`), across shadow roots, so it holds across
  streamed chunks without a global. It writes `data-gyral-stores` (the `.instances`' states) as
  before; `defineStoresProvider()` is removed.

# ADR 0010 — Child components: props down, outputs up

Status: **accepted** (2026-10-04). Bead: gyral-czi.5. Replaces Cycle's `isolate()` and
`@cycle/state` `makeCollection`.

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): `each()` replaces `repeat`/`keyed`; `live`, `classMap`, `styleMap`, `unsafeCSS` and `ElementDirective` are gone (element hooks replace directives). Lit-specific text below describes 0.2.x.

## Decision

- **Props down:** the parent's view sets properties: `<todo-item .item=${it}>`. The child
  reads them as context and reacts with `PropsChanged` (ADR 0007).
- **Outputs up:** a child reducer returns `emit(output)`, a command like any other, so it
  stays pure and testable. `define()` handles emit commands itself. It dispatches a
  `gyral-output` CustomEvent from the host in a microtask, so outputs keep their order and
  never fire inside the parent's render. The event has `bubbles: true` and `composed: false`,
  so it travels only within the parent's shadow tree.
- **The parent parses outputs as intents.** A custom element with `data-intent` triggers on
  `gyral-output` by default. `child(ChildClass, (output, el) => msg)` types `output` by the
  child's output union (the 4th `define` type parameter) and `el` as the child instance, so
  props such as `el.item.id` are typed. That is how a list item identifies itself.
- **One parent message per child kind (Elm-style):** `{ _tag: 'Item', id, out }`, with the
  reducer switching on `out._tag`. An intent parser must produce its own tag's variant
  (ADR 0001), so wrapping is the natural shape.
- **Collections:** Lit's `repeat(items, key, template)`. Keys keep each child element (and its
  local state) attached to its item across reorders. No collection API of our own.
- **Isolation:** Shadow DOM. A child's clicks never match parent intents, and a grandchild's
  outputs stop at the child's shadow root.
- **Interop:** any custom element (raw Lit, or another library) can talk to a Gyral parent
  by dispatching `gyral-output` with a tagged `detail`.

## Consequences

- `define<S, M, P, O>`: `O` is type-only. `emit()` checks that the output is tagged but not
  its exact variant; the parent's `child()` mapper is where variants are matched
  exhaustively.
- Instance types include their declared props (`InstanceType<typeof Item>['item']`).
- Shared state across distant components is a separate concern (signals; not decided yet).

## Addendum: lazy sources for recursion (gyral-czi.13, 2026-10-04)

`child()` also accepts `() => ChildClass`, resolved when an event arrives. A component that
contains itself (a folder tree) uses `child(() => Folder, …)` and annotates the constant
(`const Folder: GyralElementClass<S, M, P, O> = define()(…)`) so TypeScript accepts the
self-reference. Instance types expose declared props as writable properties.

## Addendum: stateless children and controlled inputs (gyral-czi.14, 2026-10-04)

- **Stateless children:** `define<Stateless, Msg, Props, Out>()(…)` may omit `init`; the types
  only allow that when `{}` is a valid state. Such a component is a pure view of its props
  that reports changes up with `emit()`.
- **Controlled inputs:** when the parent owns a value and may clamp or reject a change, bind it
  with `.value=${live(…)}` (re-exported from core). Plain `.value=${…}` compares against the
  last rendered value, so a rejected change would stay in the input.
- **Single-variant outputs:** while a child's output union has one variant, the parent's
  reducer reads `out` directly; `switch (out._tag)` with one case trips
  `no-unnecessary-condition`. Add the switch when a second variant appears (the compiler then
  forces every reducer to handle it, which is the point of the union).
- Core also re-exports `classMap`, `styleMap` and `unsafeCSS`, so examples import only
  `@gyral/core`.
- **Element directives (gyral-czi.17):** `ElementDirective<Args>` plus `directive()` give
  `<el ${myDirective(…)}>` helpers without boilerplate: subclasses implement
  `apply(element, args)`; the base checks the part type and renders nothing. `invalid()` is
  built on it. `keyed(key, template)` is re-exported for "replace this element when the key
  changes" (restarting CSS animations, resetting a subtree).

## Addendum: typed emit and the public event name (gyral-c5d.3, gyral-c5d.4, 0.3.1)

- `outputs<O>()` returns `emit` typed by the component's output union, a module-level
  constant like `intentsOf<typeof C>()`: `const emit = outputs<Out>()`. A wrong tag or a missing
  field fails to compile in the child, not only in the parent's `child()` mapper. It returns
  core's `emit` itself (no run-time cost), and unlike `emit()` it accepts outputs declared as
  interfaces (no index signature needed). `emit()` stays for untyped use.
- `OUTPUT_EVENT` (`'gyral-output'`) is exported from `@gyral/core`, with the types
  `OutputEvent<O>` (`CustomEvent<O>`) and `OutputsOf<typeof Child>`. A parent that isn't a Gyral
  component (plain DOM, another library) listens for it on the child or an ancestor in the
  same tree (`bubbles: true`, `composed: false`) and reads `event.detail`. Documented in the
  skill's composition reference and the migration guide's mixed-app note.

## Addendum: outputs reach the direct parent; slotted content is the outer component's (gyral-1zd.27, 0.3.1)

Two ownership gaps surfaced in apps that compose components deeply:

- **Outputs passed the direct parent.** A child's output bubbles (`composed: false`), so with a
  light-DOM parent it travelled on into the grandparent's tree, where the grandparent's own
  `data-intent` on the parent host matched it (a custom element's default trigger is the
  output event). The grandparent then read the grandchild's output as the parent's. Apps guarded
  every such parser with `event.target === target` checks or marker attributes.
- **Slotted content belonged to no one.** A form or a child component that the outer template
  slots into a shadow-DOM card has the card host between it and the outer root, and the
  ownership walk stopped at any Gyral host. Its intents never fired: a slotted
  `<form data-intent>` got no `FormData` and no `preventDefault`, so the browser submitted it
  natively, and a slotted child's outputs were lost.

Decision:

- An output event fires an intent only on the element it was dispatched on (the child host, where
  the direct parent's `data-intent` sits), never on an ancestor. When the direct parent's parser
  takes it (returns a message or a promise), the event stops there, so neither an outer
  component nor a page listener higher up sees it. A parser that declines lets it go on.
  Non-Gyral parents still listen for `OUTPUT_EVENT` on the child or an ancestor; the event
  still bubbles until a Gyral parent takes it.
- The ownership walk stops only at a **light-DOM** Gyral host (it rendered its own children).
  Children of a shadow-DOM host are the outer template's content, slotted in, so they stay the
  outer component's: their intents, forms (`FormData`, the cancelled native submit) and child
  outputs work as anywhere else in its template.

Like React's and Vue's component events (`emit` reaches only the parent that bound the
handler), an output is a message to one parent, not a broadcast. Tested in
`core/test/intent-ownership.test.ts`.

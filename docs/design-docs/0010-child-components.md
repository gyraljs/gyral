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
(`const Folder: GyralElementClass<S, M, P, O> = define(…)`) so TypeScript accepts the
self-reference. Instance types expose declared props as writable properties.

## Addendum: stateless children and controlled inputs (gyral-czi.14, 2026-10-04)

- **Stateless children:** `define<Stateless, Msg, Props, Out>(…)` may omit `init`; the types
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

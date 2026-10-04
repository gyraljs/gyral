# ADR 0010 — Child components: props down, outputs up

Status: **accepted** (2026-10-04). Bead: gyral-czi.5. Replaces Cycle's `isolate()` and
`@cycle/state` `makeCollection`.

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

# ADR 0007 — Props: read as context, enter state only via PropsChanged

Status: **accepted** (2026-10-04)

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): props are declared with the `prop.*` builders over Standard Schema ([view/05-element.md](view/05-element.md)); `PropDeclaration`, Lit's `willUpdate` and reactive accessors are gone. `PropsChanged` and props as context stay. Lit-specific text below describes 0.2.x.

## Context

`init(props)` runs once, so later prop changes never reached the model (gyral-czi.8). Other
frameworks agree on one thing: derive values from props instead of copying them into state,
and make "reset when a prop changes" explicit. React uses `key` and render-time derivation,
Svelte 5 uses `$derived` (writable since 5.25), Solid uses `createMemo` and the "initial*"
naming convention, Angular uses `computed` and `linkedSignal`, Vue uses `computed` and `watch`.
Elm and Cycle's lenses make the parent own the state.

Options: (A) props visible to the view and reducers, (B) a `PropsChanged` message,
(C) re-run `init` when chosen props change, (D) parent-owned (controlled) children.

## Decision

**A + B.** C may come later as a helper built on B. D is how child components work
(gyral-czi.5).

```ts
define<State, Msg, { readonly userId: string }>('user-card', {
  props: { userId: { type: String } },
  init: (props) => ({ draft: '', loadedFor: props.userId }),
  update: {
    Save: (s, m, { props }) => …,                       // props as context (A)
    PropsChanged: (s, { props, prev }) =>               // the only way props enter state (B)
      props.userId === prev.userId ? s : { draft: '', loadedFor: props.userId },
  },
  view: (s, i, { props }) => html`…${props.userId}…`,   // props as context (A)
});
```

- Context object `{ props }` is the third argument of every reducer and of `view`. It is an
  object so later context (for example `locale`) can be added without breaking anyone.
- `PropsChanged` is a framework message: `{ _tag: 'PropsChanged', props: P, prev: P }`. It is
  sent from Lit's `willUpdate` when any declared prop changed after the first render, so state
  and DOM update in the same render. Its reducer is **optional**. Without one, props are still
  readable as context.
- Like any reducer, the `PropsChanged` reducer may return effects (ADR 0006), e.g. refetch
  when `userId` changes.
- `init(props)` is unchanged.

## Consequences

- No copying props into state "just to read them".
- Every state change still goes through a reducer and is visible to tests and devtools.
- Tests: `spec.update.PropsChanged(s, { _tag: 'PropsChanged', props, prev }, { props })`.

## Addendum: honest prop types (gyral-czi.21, 2026-10-04)

A prop is `undefined` until a parent, an attribute or a hydration seed sets it, but `P`'s types
said every prop was present. Declarations now have to say how a present value is guaranteed:

```ts
define<State, Msg, { readonly label: string; readonly size: number; readonly note?: string }>('x', {
  props: {
    label: { type: String, required: true }, // missing at first render → warning, once
    size: { type: Number, default: 3 },      // ctx.props.size is 3 while the element's is unset
    note: { type: String },                  // type includes undefined: nothing to declare
  },
  …
});
```

- `PropDeclaration<T>` is Lit's `PropertyDeclaration` plus `required` / `default`. A prop whose
  type excludes `undefined` must declare one of them; the compiler enforces it.
- `default` is applied when components read props (`ctx.props`, `init`, `PropsChanged`); the
  element's own property stays `undefined`, and seeds carry only values that were really set.
- `required: true` is a contract with the parent; a missing value logs
  `<tag> is missing required prop(s): …` once per instance, at first render (server or client).
- Migration: add `required: true` to props that are always set by their parent.

## Addendum: props that shadow built-ins (gyral-czi.33, 2026-10-04)

A declared prop whose name is a built-in element property (`hidden`, `title`, `id`, `slot`,
`style`, `dir`, `lang`, `inert`, …) replaces that property with Lit's reactive accessor, so
setting it silently changes platform behaviour: gyral-shop's form disappeared because a prop
was named `hidden`. `define()` now warns once, in the browser, listing the offending names
(`name in HTMLElement.prototype`). Rename such props (`isHidden`, `heading`, `itemId`).

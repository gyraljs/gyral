# ADR 0007 — Props: read as context, enter state only via PropsChanged

Status: **accepted** (2026-10-04)

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

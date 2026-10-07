# Devtools

Gyral's loop is data all the way through, so development builds emit a timeline: component
connect/disconnect, `hydrated`, hydration `mismatch`es, every `update` (message with previous
and next state), every command phase (`issued`, `dropped`, `interrupted`, `settled`, `failed`,
with driver, lane and policy) and store messages. Production builds strip all of it (`@gyral/core` resolves its
`#devtools` import to a no-op through the `development`/`production` export conditions).

## Open the panel

```ts
// Development only: Vite replaces import.meta.env.DEV with false in production builds,
// so the panel never ships. Add ?devtools to the URL to open it.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('devtools')) {
  void import('@gyral/devtools').then(({ mountDevtools }) => {
    mountDevtools({ open: true });
  });
}
```

`npm i -D @gyral/devtools`. Toggle with the panel button or **Alt+Shift+D**. Sections:
**timeline** (newest first, text filter and kind checkboxes), **components** (live instances
and their state), **command lanes** (owner, lane, policy, in-flight count).

## Using it to debug

- A click does nothing → no `update` row: the element lacks `data-intent`, the trigger is wrong
  (add `data-intent-on`), the parser returned `undefined`, or the element belongs to a nested
  component.
- State changes but the view doesn't → the view reads something other than state/props/stores.
- A request's result is ignored → look for `interrupted` (`switch`) or `dropped` (`exhaust`)
  in its lane, or a reducer that discards stale answers.

Non-Vite bundlers need the `development` resolve condition set to get events.

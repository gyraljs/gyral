# Idioms, anti-patterns and common errors

## Idioms

- **Name messages after what happened**, in the past or as a user verb: `Typed`, `Submitted`,
  `Found`, `SearchFailed`, `Increment`. One union per component, `readonly` fields.
- **State as a tagged union** for anything with phases (`Idle | Loading | Loaded | Failed`).
- **Small pure helpers** for derived values (`total(cart)`), called from reducers and views.
- **Command factories** next to the component (`searchRepos(query, onOk, onErr)`) keep
  reducers short and make the request shape testable.
- **Carry the request key in response messages** (`{ _tag: 'Found', query, … }`) and ignore
  answers for a stale key.
- **One route table** (`routes({...})`) shared by server and client; titles from one pure
  function used by `setTitle` and the server's `<title>`.
- **Widgets in shadow DOM with `styles`; pages in light DOM** with document CSS.
- **Test the model first** (`step`/`run`), then one or two browser tests per component.

## Anti-patterns → do this instead

| Don't                                                                             | Do                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `@click=${() => this.x()}` or any closure in a view                               | `data-intent=${i.X}` + an intent parser                                 |
| `fetch()`/`setTimeout`/`Math.random()`/`Date.now()` in `update`, `init` or `view` | return a command (`get`, `delay`, `random`, a custom driver)            |
| Mutating state (`s.items.push(x)`)                                                | return a new object (`{ ...s, items: [...s.items, x] }`)                |
| Array as the whole state                                                          | wrap it: `{ items: [...] }` (an array return means `[state, commands]`) |
| Copying props into state in `view` or forgetting later changes                    | `init(props)` + a `PropsChanged` reducer, or read `ctx.props` directly  |
| `.checked=${s.on}` in SSR'd views                                                 | `?checked=${liveBoolean(s.on)}`                                         |
| `html\`<textarea>${s.text}</textarea>\``                                          | `textarea({ value: s.text, attrs: {...} })`                             |
| Parent reading or setting a child's internal state                                | props down, `emit()` outputs up, or a store                             |
| Global singletons / module-level mutable state for shared data                    | `defineStore` + `send` + `ctx.read`                                     |
| Booleans `isLoading`, `hasError`, `data` side by side                             | one tagged union                                                        |
| `Map`, `Set`, `Date`, class instances, functions in state                         | plain JSON (arrays, objects, ISO strings)                               |
| Passwords or tokens in state                                                      | keep them only in the submitted `FormData`                              |
| Fetching in a component during SSR                                                | load in the request handler; pass props or store seeds                  |
| Importing `lit` directly in app components                                        | import `html`, `css`, directives from `@gyral/core`                     |
| `@gyral/ssr/hydrate` imported after components                                    | import it first in the client entry                                     |
| jsdom/happy-dom tests                                                             | Vitest browser mode, plus DOM-free `step`/`run` tests                   |
| Blanket `:not(:defined) { visibility: hidden }` in SSR apps                       | scope it to client-rendered tags only                                   |

## Common errors and fixes

| Symptom                                                         | Cause                                                                                                     | Fix                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Click does nothing                                              | no `data-intent`, wrong trigger, parser returned `undefined`, or the element is inside a nested component | check markup, add `data-intent-on`, check the parser; open devtools (`?devtools`)      |
| TypeScript: property missing in `update`                        | `update` must handle every tag of `Msg`                                                                   | add the reducer (even `(s) => s`)                                                      |
| TypeScript: prop needs `required` or `default`                  | non-optional prop type without a guarantee                                                                | declare `required: true` or `default`, or make the type include `undefined`            |
| "Multiple versions of Lit loaded" / duplicated DOM on hydration | two copies of Lit                                                                                         | `gyralVitePreset()` in Vite and Vitest configs; Lit as a peer                          |
| "Vite unexpectedly reloaded a test" on the first run            | Lit modules discovered mid-run                                                                            | `gyralVitePreset()` (add extra Lit modules via `optimize`)                             |
| Page renders, then flickers or re-renders on load               | hydrate support loaded too late                                                                           | `import '@gyral/ssr/hydrate'` first in the entry                                       |
| "Hydration value mismatch"                                      | server and client render different markup (dates, random, `window` checks)                                | render from state only; use the `Hydrated` message for JS-only UI                      |
| Checkbox checked on the server when `false`                     | `.checked=${false}` serialized as `checked="false"`                                                       | `?checked=${liveBoolean(x)}`                                                           |
| `<textarea>` throws "Unexpected final partIndex" during SSR     | binding inside `<textarea>`                                                                               | `textarea()` directive                                                                 |
| Stale results overwrite new ones                                | default `merge` lane                                                                                      | `concurrency: 'switch'` with a `key`, and compare the query in the reducer             |
| Double submits                                                  | default lane allows concurrent requests                                                                   | `concurrency: 'exhaust'` (the default for `submitForm`)                                |
| Form errors don't show without JS                               | errors only via `invalid()` (browser-only)                                                                | also render `aria-invalid` and the error text in markup                                |
| Custom error stays on a field                                   | `invalid()` got the same array again                                                                      | keep `fieldErrors()` results in state; clear them on submit                            |
| `aria-labelledby` id not found from a component                 | ids don't cross shadow roots                                                                              | `${labelledBy('id')}`                                                                  |
| A store change doesn't re-render                                | the component doesn't list the store                                                                      | add it to `spec.stores` and read it with `ctx.read(store)`                             |
| Link clicks reload the page in an SPA                           | link capture is off by default                                                                            | `drivers: { router: makeRouter({ captureLinks: true }) }` on the page-owning component |

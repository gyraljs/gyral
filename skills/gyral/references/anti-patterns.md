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
| `.value=${s.text}` / `.checked=${s.on}` on form controls                          | `value=${s.text}` / `?checked=${s.on}` (live form state)                |
| A list row reading `s`, `i` or `ctx` from the view                                | `intents<Msg>()` at module level for names; the rest through `pick`     |
| Parent reading or setting a child's internal state                                | props down, `emit()` outputs up, or a store                             |
| Global singletons / module-level mutable state for shared data                    | `defineStore` + `send` + `ctx.read`                                     |
| Booleans `isLoading`, `hasError`, `data` side by side                             | one tagged union                                                        |
| `Map`, `Set`, `Date`, class instances, functions in server-rendered state         | plain JSON (arrays, objects, ISO strings); client-only state may differ |
| Passwords or tokens in state                                                      | keep them only in the submitted `FormData`                              |
| Fetching in a component during SSR                                                | load in the request handler; pass props or store seeds                  |
| Importing `lit` (0.2's renderer) or another renderer's `html` in Gyral components | import `html`, `css`, `each`, hooks from `@gyral/core`                  |
| `attr=${x ?? nothing}`                                                            | `attr=${x}`: `null`/`undefined` remove the attribute                    |
| jsdom/happy-dom tests                                                             | Vitest browser mode, plus DOM-free `step`/`run` tests                   |
| Blanket `:not(:defined) { visibility: hidden }` in SSR apps                       | scope it to client-rendered tags only                                   |

## Common errors and fixes

| Symptom                                                      | Cause                                                                                                     | Fix                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Click does nothing                                           | no `data-intent`, wrong trigger, parser returned `undefined`, or the element is inside a nested component | check markup, add `data-intent-on`, check the parser; open devtools (`?devtools`)      |
| Production log `Gyral G0010 my-cart Add https://…`           | production builds print a code and the message's arguments instead of the text                            | open the URL (every code at gyral.dev/errors), or reproduce in development             |
| TypeScript: property missing in `update`                     | `update` must handle every tag of `Msg`                                                                   | add the reducer (even `(s) => s`)                                                      |
| TypeScript: long "`IntentParser<…>` is not assignable" error | a parser or `child()` mapper annotated with the whole union (`(out): Msg => …`)                           | no annotation in the spec, or `Extract<Msg, { _tag: 'X' }>`; outside, `'X' as const`   |
| TypeScript: prop builder doesn't fit the props type          | a builder without `required`/`default` includes `undefined`                                               | `prop.string({ required: true })`, a `default`, or a type with `undefined`             |
| `vite build` fails with a template rule error                | the template compiler checks every `html` (rows, form state, holes)                                       | fix the template as the message says (docs/design-docs/view/09-template-rules.md)      |
| "Vite unexpectedly reloaded a test" on the first run         | a dependency discovered mid-run                                                                           | `gyralVitePreset({ optimize: ['the-module'] })`                                        |
| "a row depends on something not passed through item or pick" | an `each` row reads changing outside state                                                                | return it from `pick` and take it as the row's second argument                         |
| `HydrationMismatch`: "gyral: hydration mismatch in …"        | server and client render different markup (dates, random, `window` checks)                                | render from state only; use the `Hydrated` message for JS-only UI                      |
| Stale results overwrite new ones                             | default `merge` lane                                                                                      | `concurrency: 'switch'` with a `key`, and compare the query in the reducer             |
| Double submits                                               | default lane allows concurrent requests                                                                   | `concurrency: 'exhaust'` (the default for `submitForm`)                                |
| Form errors don't show without JS                            | the error text is only in native validity                                                                 | also render the error text in markup (`invalid()` writes `aria-invalid`)               |
| Custom error stays on a field                                | `invalid()` got the same array again                                                                      | keep `fieldErrors()` results in state; clear them on submit                            |
| `aria-labelledby` id not found from a component              | ids don't cross shadow roots                                                                              | `${labelledBy('id')}`                                                                  |
| A store change doesn't re-render                             | the component doesn't list the store                                                                      | add it to `spec.stores` and read it with `ctx.read(store)`                             |
| Link clicks reload the page in an SPA                        | link capture is off by default                                                                            | `drivers: { router: makeRouter({ captureLinks: true }) }` on the page-owning component |

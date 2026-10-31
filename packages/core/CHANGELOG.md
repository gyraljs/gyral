# @gyral/core

## 0.3.10

0.3.10 fixes what migrating the apps to 0.3.9 found and adds the versioned SSR protocol (epic
gyral-uvj). The first three entries change what a working app sees: in development a hydration
mismatch renders the component fresh and logs an error instead of leaving it dead, and a
`<noscript>` notice, in a view or in `raw()` markup, hydrates and is created empty on the
client. Browser bundles built without Vite now get core's production build, without development
code.
[Behavior changes in 0.3.10](https://github.com/gyraljs/gyral/blob/v0.3.10/docs/references/migrating-0.3.9-to-0.3.10.md)
lists each with what to do, then the new checks and the workarounds you can remove.

### Patch Changes

- 5cb7e66: In development, a hydration mismatch no longer leaves the component dead (gyral-uvj.3). A
  component whose server-rendered DOM doesn't match its first client render is now rendered
  fresh in development too, exactly as production builds already did, and responds to intents.
  Development logs the mismatch with `console.error` in full (G0062: the component, the
  template's call site, the DOM path, what was expected and what was found), then G0063.

  Before, development threw the mismatch: the component kept the server's DOM, no render updated
  it, and every render tried to hydrate again. A mismatch Gyral itself caused (a `<noscript>`
  notice, fixed in this release) left a component you couldn't fix from your code. The mismatch
  was also reported as a view failure (G0031): the component's `error` view rendered, and
  `window` `error` listeners and `collectErrors()` saw it. It no longer goes through the error
  channel in either build; look for the console error instead. `hydrated()` from
  `@gyral/testing` still fails a test on it, now quoting the mismatch itself. Production is
  unchanged.

- 467f293: A `<noscript>` notice in a component's view no longer breaks hydration (gyral-qqa). The browser
  keeps a server-rendered `<noscript>`'s content as text while scripts run, but the client's
  template held it as elements, so every such notice was a hydration mismatch (G0062): development
  threw and the component never hydrated; production rendered it fresh and warned (G0063).
  Hydration now adopts a `<noscript>` element as it is, without comparing its content.

  A `<noscript>`'s content is now server-only: a client render creates the element empty. Before,
  Chromium and Safari built its markup as live elements, so a `<noscript><style>` applied to the
  page and a `<noscript><img>` loaded while scripts ran. The development runtime no longer reports
  such a notice as a template rule 7 repair. A `${…}` inside `<noscript>` was already template rule
  3; its message now says to write the notice as static markup and keep what changes outside it.

- 9ab416d: A `<noscript>` inside `raw()` markup is now inserted empty in the browser (gyral-uvj.2), as a
  `<noscript>` in a template already is in this release. Before, Chromium and Safari parsed the
  notice's markup into live elements while scripts ran, so a `<noscript><style>` applied to the
  page and a `<noscript><img>` loaded; Firefox inserted it as text. The server still writes
  `raw()` markup verbatim, so visitors without JavaScript see the notice, and hydration keeps the
  server's notice as it is. If a script read the notice's elements on the client, render that
  content outside the `<noscript>`.

- 65a7dd5: Browser bundles built without Vite get no development code (gyral-gpr). Core's development
  checks were guarded by a flag that only Rollup-based bundlers (Vite) resolve across modules, so
  esbuild, webpack, Rspack, Parcel and Bun kept every check and the modules only they use as dead code in
  production: 17 to 19 KB minified in a small app, the template rule 15 element list, the
  undefined-tag watch and the skipped-view recheck included. `@gyral/core` now also ships a
  production build, `dist/prod/`, with that code removed when Gyral is built, and its exports send
  the `browser` condition there unless `development` is set. An esbuild bundle of gyral-rs's
  Askama client goes from 86,958 to 69,151 bytes. Development builds, Vite's output, and Node,
  Deno and Bun (which always load the full build, as before) are unchanged. For development
  checks in a non-Vite browser build, pass the `development` condition (esbuild:
  `conditions: ['development']`).

  `@gyral/ssr` finds core's hydration chunk in the production build too, so `clientAssets` and
  `renderPage` keep preloading it.

- 87a29dd: `gyral/prefer-built-in` now warns about `JSON.parse` of a prop whatever the props parameter is
  called, and when it is destructured (gyral-bt4): `init: (p) => ({ a: JSON.parse(p.a) })`,
  `init: ({ items }) => …JSON.parse(items)…` and `view: (s, i, { props: { items } }) => …` warn
  as `init: (props) => …JSON.parse(props.a)…` already did. The rule finds the props by their
  position in the spec's functions: `init`'s first parameter, `subscriptions`' second, and the
  context of `view`, the reducers, intent parsers (`on()`'s too) and `formAssociated`. Linting may
  show new warnings where a component parses a prop by hand: declare it as `prop.json(schema)`,
  and Gyral parses and validates the attribute for you.

## 0.3.9

0.3.9 fixes what migrating the apps to 0.3.8 found (epic gyral-vge). The first entry changes
what a working app sees in development: apps that install Gyral from npm now get its development
checks in `vite dev` and browser tests, so warnings and errors you hadn't seen can appear, each
saying what to change. The next two change behaviour too: the dev server renders an edited
component's new code, and `ctx.props` keeps its identity while no prop changes.
[Behavior changes in 0.3.9](https://github.com/gyraljs/gyral/blob/v0.3.9/docs/references/migrating-0.3.8-to-0.3.9.md)
lists each with what to do, then the fixed checks and the workarounds you can remove.

### Patch Changes

- 9f424b5: Apps that install `@gyral/core` from npm now run its development build in `vite dev` and in
  Vitest's browser mode (gyral-3pv). Until now Vite's dependency optimizer pre-bundled core's
  production modules there, so none of Gyral's development checks ran (G0017, duplicate keys,
  impure `each` rows, template rules, prop checks) and messages printed as codes. Expect warnings
  and errors you hadn't seen; some throw, so a browser test that passed can fail, naming what to
  fix. Gyral's own examples and Node-environment tests were not affected.

  `gyral()` (and `gyralVitePreset()`) now gives the optimizer the environment's resolve
  conditions in serve mode: your `resolve.conditions`, or Vite's defaults with `development`.
  Production builds are unchanged. Remove an
  `optimizeDeps.rolldownOptions.resolve.conditionNames` workaround; one of your own still wins.

- 2bdaed3: `gyralDevServer` and `gyralDevMiddleware` now server-render an edited component on the next
  request (gyral-ejc). Before, an edit to a component module, or to a module it imports (a labels
  file), showed only after a restart: Vite ran the module again, but the server kept the first
  `define()` of each tag. The dev server now lets a later definition replace the spec, and the
  server renderer rebuilds that component, with its styles and CSP hashes. Production servers,
  tests and scripts keep the first definition, as before.

- 014eec6: `ctx.props` is now the same object while no declared prop's value changes, and a new one when
  one does (gyral-bn7). It was a new object on every read, so an `each()` pick that captured it,
  such as `(day) => ({ day, props })`, never equalled the last one: every row re-rendered on
  every render, and development warned G0017 about pure views. If your code mutated `ctx.props`,
  copy it first. Components with props bundle about 30 B (gzip) more.

  G0017's development message now says where the view differs: in its template, or in the
  innermost `each(…, Row)` or `keyed(…)` that does. When that list's pick returned a new object
  for the same item, it says to pick the fields the row reads or to pass
  `each(items, key, row, { pick, equals })`.

- 1c8ef8c: G0017 no longer warns about pure views that build their values anew each render (gyral-nyy).
  The development recheck of a skipped view now compares what the view renders, not object
  identities: `each(s.items.map(…), …)`, `keyed(key, html…)`, `.data=${{ n: s.n }}` and
  `.items=${s.items.slice()}` match what they rendered before. An `each` row whose item or pick
  changed is rendered again and compared; plain objects and arrays compare by value (deeply,
  bounded). A `Date`, `Set` or class instance built in the view still compares by reference, and
  a view that reads `Date.now()`, a module variable or the DOM still warns. Development only:
  production builds are unchanged.

- 4e9f962: Development messages now name their code: each coded one ends with its code and errors-page link, such
  as ` (G0017: https://gyral.dev/errors/#G0017)`, as production's `Gyral G0017 …` already did
  (gyral-99d). A test that matches a development message exactly (`toBe`, `toEqual`) needs the
  suffix, or can match with `toContain`. G0063's text ends with a period instead of a colon, and
  the build-time warning about a second copy of core (G0015) ends the same way. Production
  messages are unchanged.

- 26b3782: `parse()` from `@gyral/testing` now runs `on()` parsers without a DOM, so a Node test
  (Vitest's `node` environment) can test them (gyral-cd0). Before, `parse(C, 'Key', { key: 'Enter' })`
  on an `on('keydown', { keys: ['Enter'] }, …)` parser threw (G0018 for its `intent` event,
  `HTMLInputElement is not defined`, or a `TypeError` on the missing target) or quietly returned
  `undefined`. Now:

  - the event `parse()` creates has the type the `on()` parser declares and carries `key`;
  - the new `modifiers` field names the keys held: `parse(C, 'Save', { key: 's', modifiers: { ctrl: true } })`.
    It applies only to that event: with an `event` of your own, set `ctrlKey` and the rest on it
    (`parse()` throws when it gets both);
  - `on()`'s key filter reads the input's `key` before `event.key`;
  - with no target, `valueAsNumber` reads `value`, and `control`, `form` and `origin` are `undefined`.
    DOM classes are feature-detected, and an event without `composedPath()` is accepted.

  In the browser, `on()` behaves as before.

- 74b5c5a: `optimize: 'auto'` now also scans the client build's inputs and the modules in
  `components.modules` (gyral-5zi). Before, setting `optimizeDeps.entries` replaced Vite's own
  start point, `build.rollupOptions.input` (or `rolldownOptions.input`, or `input`), and the
  component scan can't see a component defined through a wrapper. A package imported only by the
  client entry or such a module was found mid-run: the dev server reloaded ("new dependencies
  found") and Vitest printed "Vite unexpectedly reloaded a test". If your config appends those
  modules to `optimizeDeps.entries` after `gyral()` as a workaround (gyral-shop's
  `scanEntries()`), you can remove it.

- b2c15d1: `gyral/prefer-built-in` warns about `.focus()` in a driver only when the element is reached
  through a component's shadow or render root (`x.shadowRoot.querySelector(s).focus()`, or a
  local name for that root), which the `focus(selector)` command replaces (gyral-um2). Before, it
  warned about every `.focus()` in a driver, also on a page element outside any component
  (`document.querySelector`, `getElementById`) or one the driver is handed, which `focus()` can't
  reach: it searches only the component's own root. Such drivers no longer warn; drop any
  `eslint-disable` you added for them.

- 7547000: The docs say two costs plainly (gyral-crt). `subscription(…, { coalesce: 'microtask' | 'frame' })`
  delays the first value too, by a microtask or a frame, so nothing arrives in the same turn as
  `emit`: a driver's unit test that checks right after `emit` awaits one first. And `on()` is a
  module of its own, about 0.43 KiB gzip, paid once per app on its first use; the
  `gyral/prefer-built-in` warnings that suggest it now say so, so an app weighing bytes can decide.

## 0.3.8

0.3.8 delivers the "Now" items of the 2026-10-28 ecosystem review and a full dependency update.
The first three entries change behaviour that a working app can notice: a view renders only when
its inputs change, Gyral's packages take core as an exact-version peer, and `gyralDevServer`
builds the app once per server-module version. [Behavior changes in 0.3.8](https://github.com/gyraljs/gyral/blob/v0.3.8/docs/references/migrating-0.3.7-to-0.3.8.md)
lists each with what to do, then the new checks and the workarounds you can remove, and
`npx @gyral/codemod 0.3.8` rewrites the API changes it can prove safe.

### Patch Changes

- c765366: **Behavior change:** a component renders only when its state, a declared prop or a declared
  store's value changes (gyral-337.1). A message whose `update` returns the same state no longer
  runs the view; that render wrote nothing anyway. A view that reads anything else (`Date.now()`,
  a module variable, the DOM) stops refreshing on unrelated messages: move that into state, a
  prop or a store. Development re-runs skipped views and warns once per component when one
  renders differently (G0017).

  `each(items, key, row, { pick, equals })` compares picked values with `equals`, and
  `subscription(…, { select, equals, coalesce })` maps each value, drops repeats, or delivers
  only the latest per microtask or animation frame.

- 3e3200b: Gyral's packages take `@gyral/core` as a peer at their exact version (gyral-337.5, ADR 0033),
  so a package manager never installs a second core for them: the app's copy is used, and a
  mismatch shows at install time (pnpm reports the unmet peer, npm stops with ERESOLVE). Give
  every `@gyral/*` package the same version.

  Each package also checks core's version when it loads: another release throws G0016 in
  development, naming both versions, and logs the coded warning in production. A new guide,
  "Publishing a component library", says how third-party libraries list core: a caret peer, and
  public entry points only.

- fd34041: `gyral()` from `@gyral/core/vite` is Gyral's Vite plugin list: `plugins: [gyral(), mine()]`,
  with nothing to spread or merge (gyral-337.3). `gyralVitePreset()` still works through 0.3.x.
  In dev, the app's direct dependencies that use Gyral (a design system, a widget library) are
  pre-bundled with core, and `optimize: 'auto'` points Vite's startup scan at the modules that
  define components and at a Vitest browser project's tests, so Vite stops discovering their
  imports mid-run; it is on by default when Vite runs as a custom server.

  `gyralDevServer` builds the app once per server-module version, not per request, and
  `gyralDevMiddleware` (`@gyral/ssr/node`) runs the dev server inside an Express, Connect or
  Fastify server of your own (gyral-337.12).

- 29bcfb1: Typed driver provision (gyral-337.2): a driver token provides its own implementation,
  `token.provide(run)` (named by the token, `run` typed by its input and output), and
  `subscription(token, subscribe)` is a subscription named and typed by its token. Drivers can be
  supplied as a list, each under its own name: `provideDrivers(root, [session.provide(run)])`,
  `el.drivers = [fake]`, `<gyral-drivers>`, `mount({ drivers })` and stores. Records keep working;
  development throws G0044 for two drivers of one name in a list and warns (G0045) when a
  record's key isn't its driver's name.

- 6fa91db: `on(event, [filter], parser)` (gyral-337.6): an intent parser typed by its event (`keydown`
  gives a `KeyboardEvent`), whose input adds `control`, `form`, `modifiers`, `files`,
  `valueAsNumber` and `origin`. A key filter (`keys`, `modifiers`) declines other keys, which pass
  outward with their default action. Development throws G0018 when another event reaches an
  `on()` parser, and the new `gyral/intent-event` ESLint rule (an error in the recommended
  config) finds such a binding in the editor. A module of its own: apps that don't call it don't
  bundle it.

- 44eba98: `gyral/prefer-built-in` (gyral-337.4), a new `@gyral/core/eslint` rule, warns in the recommended
  config about hand-written versions of what Gyral has built in, each message naming the built-in:
  a dialog opened with `showModal()` (`?modal`), `.focus()` in a driver (the `focus()` command),
  `JSON.parse` of an attribute or prop (`prop.json()`), a subscription that drops repeats by hand
  (`equals`), a record of drivers outside tests (a list), and intent parsers that check the event's
  type, modifier keys, `Number(value)` or `composedPath()[0]` (`on()`). `gyral/intent-event` now
  reads every event of a quoted `data-intent-on="keydown keyup"`, not only the first.

- 8d5ebb4: Node 26, LTS since 2026-10-28, is supported beside Node 24 (gyral-337.11): every package's gate
  runs on both.

## 0.3.7

0.3.7 fixes five bugs found in the apps that use Gyral. The first three entries change
behaviour that a working app can notice; [Behavior changes in 0.3.7](https://github.com/gyraljs/gyral/blob/v0.3.7/docs/references/migrating-0.3.6-to-0.3.7.md)
lists each with its fix, then the new checks and the workarounds you can remove.

### Patch Changes

- 2c1f071: **Behaviour change:** a client-rendered component's `init` commands now start after its first
  render, as a server-rendered component's always did (gyral-k97.3). They started when the
  element connected, which for an element already in the page is inside `define()`, so a page
  entry that statically imports its components ran them before its own `provideDrivers()`: a
  driver token failed with G0043, and a driver with a default silently ran the default instead of
  the page's override. `provideDrivers()` anywhere in the entry's synchronous code is now in time.

  - A driver that answers synchronously during `init` delivers its message after the first
    render: one more render, in the same task.
  - A component whose first render throws starts its `init` commands once a render succeeds.
  - A component removed before its first render starts them once it is attached and renders.
  - G0043 now says how to order a page's boot: provide drivers before importing components, or
    later in the same task, with no `await` in between (or set `el.drivers` on an element built
    in code before inserting it).

- 16ef016: **Behaviour change:** a light-DOM component (`shadow: false`) rendered in the browser now
  replaces the children the page's HTML gave it on its first render, as a shadow root always did
  (gyral-k97.4). It used to keep them and append its view after them, so a no-script message
  written inside the component stayed visible beside it. Children in the page's HTML are fallback
  content: shown until the component renders, and without JavaScript. Server-rendered light
  components still hydrate their own children in place, and a component moved after its first
  render keeps its view. An element defined by a synchronous classic script before the parser
  reaches its children is not covered (module scripts, such as Vite's entry, run after parsing).

- 3d21a73: **Behaviour change:** a new template error, rule 16, and two checks catch names the
  platform resolved silently (gyral-k97.5).

  - **New template error, rule 16:** an attribute name with capitals on a custom element,
    `<pool-card playerBase=${n}>`. HTML lowercases it to `playerbase`, and a prop `playerBase`
    reads `player-base`, so the value was lost. Write `player-base=${n}`, or bind the property,
    `.playerBase=${n}`. `vite build` with the preset and ESLint (`gyral/template`) report it, and
    the runtime in development. An `attribute: 'playerbase'` override keeps working; write the
    attribute in lower case in templates. Built-in HTML elements and SVG content are not checked.
  - **Reserved prop names:** a prop named `state`, `send`, `drivers`, `stores`, `initialMessages`
    or a custom-element callback replaced the element's own member (a prop `state` hid the
    model). It is now a development error (G0023, as built-in names already were) and a type
    error in `define()`, as are built-in names such as `hidden`. Rename the property and keep the
    attribute: `badge: prop.string({ attribute: 'state' })`.
  - **Development warning G0024:** a host whose page HTML (or host framework) gave it the
    lowercased name of a camelCase prop, such as `playerbase` for `playerBase`, warns once at its
    first connect.

- 295c705: Dialogs and command intents in installed component libraries now work in production builds. A published library ships its templates compiled, and the build's feature scan only recognized `?modal=`, `?popover-open=` and a bound `data-intent-on` in source markup, so the reduced `gyral-compiled` runtime left their code out and a library's `<dialog ?modal=…>` silently never opened (development was unaffected). The scan now reads the compiled forms too. If you removed the `gyral-compiled` condition to work around this, you can restore it. A production build that still runs one of these bindings without its code now logs `Gyral G0069` instead of failing silently.

- 1454ffe: Keep an app on one copy of `@gyral/core` (gyral-k97.2). A second copy fails far from the cause:
  a stylesheet one copy made crashed the other with `styles.flatMap is not a function`.

  - `gyralVitePreset()` now pre-bundles the browser entry points of every Gyral package installed
    for the app, in the dev server and Vitest, so Vite no longer bundles a second copy of core for
    a Gyral package it meets partway through a run ("Vite unexpectedly reloaded a test"). Remove
    Gyral's packages from your `optimize` list; keep other dependencies there.
  - The preset warns once, in dev and builds, when `@gyral/core` is installed more than once,
    naming each copy's version, folder and the packages that use it, and how to pin one version.
  - Development builds warn in the browser when a page runs a second copy of core (G0015).

## 0.3.6

### Patch Changes

- 893c4e7: Docs and agent guidance aligned with the code:

  - `listen`'s doc comment (and so `get_api("listen")` and the API reference) starts it from `subscriptions`, not `init`, matching the guides and `check_snippet`.
  - `scaffold_component`'s `ssr-page` route imports the component from `../src/`, where it is written; a test now resolves every relative import in every scaffold.
  - Development error messages no longer cite internal design documents; the hydration-mismatch message links to gyral.dev. The error groups on the errors page are named "Error handling", "Subscriptions" and "Element calls".
  - `retry`'s doc comment names `provideDrivers` and `el.drivers` (the spec `drivers` field was removed in 0.3.1); `@gyral/testing`'s description drops the removed schema arbitraries; the `clientOnly` comment drops a removed API.
  - create-gyral's `AGENTS.md` adds the MCP server, `llms-small.txt`, the `subscriptions` rule and the real `typecheck` script.

- 820577b: Development builds warn (G0014) when a custom-element tag on the page stays undefined 3 seconds after load or after a later `define()`, which usually means the entry never imports the component's module. Template rule 15 now runs in the browser only in development: `vite build` with the preset and ESLint still reject `<SignupForm>`, and production bundles built without the preset no longer carry the list of HTML element names (about 0.4 KiB gzip).

## 0.3.5

### Patch Changes

- be8f8d1: New template rule 15: a JSX-style component reference such as `<SignupForm></SignupForm>` in an
  `html` template is now an error in `vite build`, the development runtime and the ESLint
  `gyral/template` rule. HTML reads it as an unknown `<signupform>` element that renders nothing,
  so the page silently lost the component; the message says to write the tag name the component
  was defined with (`<signup-form></signup-form>`) and to import its module. Only names that
  start with a capital letter, have no hyphen and are not HTML elements are rejected, so markup
  that worked before still builds.

## 0.3.4

### Patch Changes

- 340eae6: The Vite preset's component scan (`gyralVitePreset({ components })` and the generated
  `.gyral/elements.d.ts`) now skips `define()` calls inside comments and inside string, template and
  regular expression literals, so a code sample in a string, a doc comment or a test fixture no
  longer registers a tag that doesn't exist or maps a tag to the wrong module. Real calls are found
  as before, including the curried `define<State, Msg>()('tag', …)` form and calls inside a
  template's `${…}`.

## 0.3.3

### Patch Changes

- No changes to `@gyral/core`; it is released at 0.3.3 with the other packages, for the
  `@gyral/mcp` fix.

## 0.3.2

### Patch Changes

- Export the helper types `Reducer`, `Variant`, `ParseResult` and `StandardSchemaV1` (type-only),
  so reducers and parsers written outside a component spec can be typed without copying
  Gyral's internal definitions.
- The development template locator no longer adds branches to your coverage reports: call
  sites now go through a virtual helper module instead of an inline `.at?.() ?? html` fallback.
- The components build metadata (`.vite/gyral-components.json`) gains `chunkModules`, which maps
  each emitted chunk to the root-relative source modules it contains, including workspace
  modules Vite merged into a shared chunk. Offline caches and service workers can use it to
  know which chunk serves which module.
- Public doc comments no longer point at repository paths or tracker IDs.

## 0.3.1

### Patch Changes

This release includes API removals and behavior changes. Read the
[0.3.0 → 0.3.1 migration guide](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.3.0-to-0.3.1.md) before upgrading, and keep the nine
Gyral packages on the same version.

- Components use `define<State, Msg>()(tag, spec)` with typed intent names, tag-only intents,
  parser state access and typed outputs. A declined intent bubbles to the next matching
  intent; child outputs stop at their direct consuming parent.
- Declarative `subscriptions` reconcile long-lived commands, with typed `subscription()`
  builders, cancellation and stable command lanes. Drivers resolve through the host/root
  override boundary; retry supports predicates, backoff and jitter.
- Views gain `svg` templates, `keyed` replacement, disposable `defineHook` hooks, delegated
  shadow focus, `focus(..., { wait: true })` and post-render `call` commands. Hooks run after
  child renders and dispose when their owned elements are removed.
- Native modal/popover bindings open after DOM insertion and child renders. Conditional
  insertion, keyed replacement, initial opening and hydration follow the same ordering.
  Intents dispatched by native focus complete their renders before focus commands and `settled`.
- Opt-in `formAssociated` components project native values and validity and receive reset,
  disabled and restoration messages. Native SSR fallback controls can preserve edits made
  before hydration without duplicate form entries.
- Optional `@gyral/core/storage` provides schema-decoded localStorage operations and change
  subscriptions. Optional `@gyral/core/indexeddb` provides typed records, bounded queries,
  synchronous migrations and atomic transaction batches. Neither adds code to unused apps.
- Forms validate and refill through their definitions, retain user edits until model values
  change, and redact password/passcode/CSRF fields plus explicitly named secrets. Shared head
  data covers title, metadata, canonical URLs and JSON-LD across server rendering and routing.
- The Vite preset supports client-only builds, automatic component modules, explicit wrapper
  module mappings and generated element typings. Entry-imported components stay in their
  entry; loader/preload work and spec features are reduced when unused.
- Unified `GyralError` reporting, `Errored` reducers and error views handle failures in the
  browser and server. Production diagnostics use stable codes linked to the public reference.
  Strict CSP style bindings use CSSOM; seeded hydration and Trusted Types paths are verified.
- Compiler/runtime/lint template rules agree, including boolean bindings written as `?name`.
  Public exports have a checked inventory; duplicate/internal helper APIs are removed as
  described in the migration guide.

The lockstep release also adds optional/catch-all routes in `@gyral/router` and native
EventSource/WebSocket entries in `@gyral/http`; see those packages' changelogs.

## 0.3.0

### Minor Changes

- 595e1c4: `renderPage({ csp })` also takes `contentSecurityPolicy()`'s options (`{ directives, styles? }`)
  and builds the `Content-Security-Policy` header when the page renders, so components whose
  modules were imported after startup get their `<style>` hashes too (a policy built earlier
  silently lacked them, and the browser blocked those styles). `styles` defaults to the page's
  own; the header is cached per options object until another component registers.
  `contentSecurityPolicy()` stays for static use; in development `renderPage` warns when a header
  it is given lacks a registered component's hash. `@gyral/core/server` adds `styleHashSync()`
  (the CSP hash, synchronously: a small SHA-256 in JavaScript), `componentStyles()` and
  `development`. The `create-gyral` ssr template uses `csp: {}`.
- ca68fe8: `@gyral/core/eslint`: an ESLint flat-config plugin (`gyral.configs.recommended`). `gyral/template`
  reports the template rules (docs/design-docs/view/09-template-rules.md) in the editor, with the
  compiler's and the development runtime's own messages, at the tag, text or `${…}` they are
  about; `gyral/each-row-purity` reports `each` rows that read the view's scope and `each` calls
  without a key function (view/03-lists.md). ESLint 9 or 10 is an optional peer dependency.
- 784bd2f: `renderOnFrame` (spec field): messages from bursty sources (a WebSocket feed, sensors) render in
  the next animation frame, once for all of them, instead of in the microtask flush; reducers still
  run at once, and `'StoreChanged'` covers store changes. Pages without frames render from a 100 ms
  timer, so `settled()` never stalls. The microtask flush stays the default (flush-timing spike,
  docs/design-docs/view/04-scheduler.md).
- 6971fbe: Smaller bundles (size pass, ADR 0018): code an app doesn't use is no longer bundled. The keyed
  list reconciler comes with `each`, `raw` with `raw`, the command interpreter with `command()`,
  the store binding with `defineStore()` and prop parsing with the prop builders. Hydration and
  islands load lazily, with the first server-rendered host, so client-only pages never fetch them;
  the invoker-command fallback loads only where `CommandEvent` is missing. A component root now
  listens only for the events its templates can fire intents on (any statically named
  `data-intent-on` type works without `spec.events`). New: `intents<Msg>()`, a module-level
  constant of intent names for pure `each` rows.
- d3f540a: Gyral's own view layer replaces Lit (ADR 0018). No Gyral package depends on Lit any more, and
  `@gyral/core` has no runtime dependencies. Upgrade guide with before/after code:
  [docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

  - **`@gyral/core`:** `define()` returns a plain `HTMLElement` subclass rendered by one global
    scheduler; `await settled()` replaces `el.updateComplete`. `html`, `css` and `nothing` are
    Gyral's own; new are `each(items, key, row, pick?)` (keyed lists with pure rows),
    `intents<Msg>()`, `raw()`, `defineHook()` (the hooks `invalid` and `labelledBy` keep their call
    sites) and `HydrationMismatch`. Props are declared with `prop.string/number/boolean/json/value`
    over Standard Schema: attributes are kebab-case by default and always validated. Form state
    uses plain bindings (`value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`), written
    only when the model's value changes, so other renders keep the user's edits. Removed:
    `svg`, `classMap`, `styleMap`, `unsafeCSS` (interpolate in `css`), `repeat`, `keyed`, `live`,
    `liveBoolean`, `textarea()`, `textareaMarkup`, `directive`/`ElementDirective`,
    `defineStoresProvider`, `HIDDEN_MARKER`, `HYDRATE_KEY`, `CSSStyleSheet` in `styles`, and
    `LIT_PACKAGES`/`LIT_PREBUNDLE` from `@gyral/core/vite`. `gyralVitePreset()` now runs the
    template compiler in `vite build` (rule errors fail the build). Server rendering is
    `@gyral/core/server`; hydration is built in: each server-rendered component adopts its DOM in
    place on its own, mismatches throw `HydrationMismatch` in development and re-render just that
    component in production, and islands may sit anywhere.
  - **`@gyral/ssr`:** renders with `@gyral/core/server` (synchronous, no DOM shim). `serverHtml` is
    gone (use core's `html`); `contentSecurityPolicy()` allows components' `<style>` by hash, so
    `style-src` needs no `'unsafe-inline'`. A template that writes children inside a light
    component's tag is an error. `@gyral/ssr/hydrate` is kept as an empty entry; remove the import.
  - **`@gyral/testing`:** `hydrated()` waits for `settled()` and takes `{ releaseIslands }`; it no
    longer awaits other elements' `updateComplete`, and `mountSsr` no longer ignores Lit's console
    banner.
  - **`@gyral/devtools`:** the panel renders with the new view layer; no Lit peer.
  - **`create-gyral`:** the templates install no Lit packages and no `lit-html` override.

### Patch Changes

- fe849f8: Compiled templates are smaller: part tables are tuples with numeric kinds and `server` is written
  only when true (about a quarter less template code raw; every example's bundle shrinks by
  35-97 B gzip). Nothing decodes them at runtime; template ids are unchanged.
- 49ff2ad: The Vite preset's new `gyral:dev-server` plugin makes server rendering under Vite's dev server
  (`ssrLoadModule`) produce development output (`<!--gyral:ID-->` markers, development checks)
  with installed packages too: in serve mode it keeps `@gyral/*`, and the app's dependencies that
  depend on them, out of SSR externalization, so they resolve the `development` condition and
  share one `@gyral/core`. `vite build` is unchanged.
- 9c6c8bd: The server renderer escapes `<` and `>` in attribute values and in the seed attribute too, so
  no markup (such as `<script>`) appears raw inside an attribute. Browsers decode them, so values
  and hydration are unchanged.
- 8803ef3: Leaner page shells. A `server` template (a document shell such as `@gyral/ssr`'s `page()`) is
  never hydrated, so the server no longer writes anchor comments (`<!---->`) for it or for `raw()`
  values in its holes; templates nested in a shell keep theirs. The whitespace rules treat
  `<head>`, `<meta>`, `<link>`, `<base>` and `<title>` as block-level edges and drop all
  whitespace-only text inside `<head>`. Ids of templates with those tags change (the same in the
  compiler, the browser and the server).
- b2ae8e5: Production client builds no longer carry template ids: the template compiler leaves them out
  of the hoisted template objects, and the renderer compares templates by object identity there
  (about a fifth less compiled template code gzip: 10.32 → 8.27 KiB on a 210-template corpus).
  SSR and development builds keep their ids (development markers, collision checks). One visible
  difference: identical markup at call sites in two modules is now two templates in production,
  so switching between them replaces the instance instead of patching it.

## 0.2.0

### Minor Changes

- 74054b3: Smaller and faster, with no public API change:

  - **No Effect.** The command interpreter is now plain TypeScript with no runtime dependencies,
    so `@gyral/core` depends only on Lit. An empty app drops from about 49 KiB to about 11 KiB
    gzipped, starts faster and uses less memory; rendering speed is unchanged (ADR 0015).
  - **Template whitespace minification.** `html` and `svg` remove indentation whitespace between
    tags (once per template, on server and client alike), so lists build far fewer DOM nodes and
    bulk list updates are 9–22% faster. Inline spacing is kept as one space; `<pre>`,
    `<textarea>`, `<script>`, `<style>`, attributes and comments are unchanged. For exact
    whitespace under CSS `white-space: pre*`, use `html` from `lit`.
  - **lit-html leak guidance.** lit-html 3.3.1 and later leak a comment node per removed
    `repeat()` item (lit/lit#5298). Development builds warn once when an affected version is
    loaded; pin lit-html to 3.3.0 with an override until it is fixed upstream
    (docs/references/consumer-setup.md). New `create-gyral` apps are pinned.

### Patch Changes

- a7275e8: Copyright and package author are Mike Zupper.
- fa0156a: `focus()` returned by a reducer whose update renders inside a View Transition now runs after
  the new view has rendered, instead of before it (it used to warn "matched no focusable element").

## 0.1.0

### Minor Changes

- 8b5f5ca: First public release.

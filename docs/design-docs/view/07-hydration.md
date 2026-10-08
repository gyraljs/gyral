# 07 — Hydration

Status: **accepted** (2026-10-06), shipped in 0.3.0; implemented in Phase 5 (gyral-g1r.10;
implementation notes and resolved points marked "Phase 5"). ADR 0018 (decision F). Replaces
the Lit parts of ADRs 0012 and 0014.

Hydration is built into core. There is no separate hydrate-support import, nothing patches a
class at load time, and module evaluation order can't break it. Its code (the walk and islands)
loads lazily, with the first host that needs it ("Loading" below).

## Which hosts hydrate

A host hydrates when it connects with a `data-gyral-seed` attribute: the server always writes
one (06). Its root is its declarative shadow root, or the host itself in light-DOM mode.

**Phase 5:** a seeded host whose root is empty (no declarative shadow root, or a light host
without children) has nothing to adopt: it resumes from the seed and renders fresh. A shadow
host that finds a declarative shadow root but no seed (hand-written DSD, an unreadable seed)
clears it and renders fresh, so a view is never doubled.

## Loading (gyral-g1r.18)

The walk, the mismatch messages and islands live in one internal module
(`hydration-client.ts`) that core loads with `import()` when the first host with a seed or with
`defer-hydration` connects. Client-only pages never fetch it; bundlers emit it as its own chunk.

- The seed is still read synchronously on connect (step 1 below): a host's `state` is the
  server's from the start, even while the code loads.
- Hosts that connect while it loads wait in connection order and then continue as before (an
  island schedules its release, others start and hydrate in the next flush). Once loaded, later
  hosts continue synchronously. Server-rendered content is already on screen, so a first
  hydration one network round trip later is acceptable.
- `settled()` waits for the load and the hosts it releases (the scheduler counts it as pending
  work, 04).
- If the module fails to load (a stale deployment whose chunks are gone), the error is logged
  and waiting hosts render fresh: their roots are cleared, so a view is never doubled.
- **Preloading (gyral-g1r.21):** a server-rendered page knows it will need the chunk, so the server
  says so up front. `clientAssetsFromManifest(manifestPath, entry, also?)` (`@gyral/ssr/static`)
  reads Vite's build manifest and returns the entry's URL plus `modulepreload`: the entry itself
  first (when anything else is listed: with route chunks added it would otherwise queue behind them
  on HTTP/1.1's six connections — measured in gyral-shop, the buy box defined at 979 ms instead of
  698 ms), then its static imports (depth first) and the hydration chunk (the dynamic import whose
  source is core's `hydration-client`, from `packages/core/src/` or an installed
  `@gyral/core/dist/`) with its own imports. The app's own lazy chunks are not included unless
  named: `clientAssets(manifest, entry, also)` (or `clientAssetsFromManifest`'s `also`) adds those
  modules (manifest keys such as a route's `src/routes/product.ts`) with their imports, and
  `productionServer` gives `createApp` a `preload(modules)` that returns the list with them (cached
  per list), so a route preloads its own chunk (2026-10-06, found migrating gyral-shop).
  `page({ modulepreload })` writes one `<link rel="modulepreload">` per URL before the module
  scripts, and `productionServer` hands the list to `createApp`. The browser then fetches the entry,
  its imports and the hydration chunk in parallel, instead of the entry, then its imports, then the
  chunk once the first seeded host connects. No bytes change; client-only pages, which aren't
  rendered by `page()`, still never fetch the chunk. Checked by the isomorphic example's production
  test (`examples/isomorphic/test/prod.node.test.ts`) and
  `packages/ssr/test/modulepreload.node.test.ts`.

## Client-only builds (gyral-c5d.11, 0.3.1)

An app no server renders can say so: `gyralVitePreset({ clientOnly: true })` (or the
`gyralClientOnly()` plugin). The browser environment then resolves core with the
`gyral-client-only` condition (dev server, Vitest and `vite build`; server environments are
untouched):

- `#hydration-loader` resolves to `hydration-off.ts`: no seed reading, no `import()` of the
  hydration code, so no hydration chunk. Without other `import()`s Vite's preload helper (about
  0.5 KiB gzip) leaves the bundle too. Measured on hello-world: 8.90 → 7.85 KiB gzip initial,
  11.28 → 7.85 all chunks.
- **Server-rendered markup met anyway** (a misconfigured app) renders fresh: a seeded host drops
  its seed and runs `init` from its attributes, its root is cleared as after a failed load
  ("Loading"), so a view is never doubled, and a `defer-hydration` island starts at once.
  Development warns once, naming `clientOnly`; production renders fresh silently (the warning
  would cost every client-only app its text, and dev servers and tests show it).
- **The invoker-command fallback** (ADR 0003 tier 3, 05 "Intent events") stays reachable only
  when the build may need it: `#invoker-fallback` resolves to a slot that `use-invokers.ts`
  fills, and the preset's client-only plugin adds that module to the build when a module that
  can affect Gyral components (the app's own source, and installed packages that reach a
  `@gyral/*` package through their dependencies: 05 "Features register themselves") may make
  a root listen for `command`. In its AST (comments never count), that is:
  - a template or string whose markup has `data-intent-on="command"` (quoted or not, the
    attribute's name in any case) or a bound `data-intent-on` (it listens for every intent
    event);
  - a string that is exactly `"command"` (`events: ['command']`, a `setAttribute`);
  - Gyral's `raw` (its markup is read at run time, so it may hold `data-intent-on`): a
    referenced import of `raw` (any alias) from `@gyral/core` (or a specifier that resolves
    into core: an alias, a path), a namespace import of core read other than as
    `ns.<other export>`, a re-export of its `raw` or `export *` from it, or a dynamic
    `import()` of it. A module that re-exports core's `raw` counts itself, so `raw` imported
    through a re-exporting module (the app's own, a design system's) is seen there. A function
    of another package that happens to be called `raw`, or a dynamic `import()` of another
    Gyral package (`@gyral/devtools`), doesn't count.

  `data-intent-on` values only reach a root through Gyral templates and `raw()`, so a package
  that reaches no Gyral package can't make a root listen for `command` (markup it produces
  goes through a `raw()` call in a scanned module). The scan reads the authored source (the
  plugin runs before the template compiler) and over-approximates. Development (the
  `development` condition) always keeps the fallback. The mechanism is the build-time
  detection of 05 "Features register themselves". Before 0.3.1 shipped, the scan read every
  module's raw text: in sabacc a function named `raw` in effect and the word "states" in
  effect's and three's comments kept the fallback, Vite's preload helper and custom states
  (873 B gzip per page).

- Apps without the option are unchanged (the loader moved behind a conditional import, about
  10-20 B gzip in every app).

Tested in `core/test/client-only.client-only.test.ts` (the `browser-client-only` Vitest project)
and `core/test/compiler/client-only.node.test.ts` (builds); `pnpm size` measures
`hello-world (clientOnly)` with a budget of its own (`--client-only` adds the other examples).

## Each component hydrates on its own

- The client already has everything a component's first render needs: its state (seed, or
  `init(props)`), its props (attributes plus the seed's carried props) and its view. So each
  host hydrates **independently**, whether its parent has hydrated yet or not.
- A parent's walk treats a nested Gyral host's own content as opaque: it never walks into the
  child's shadow root, nor into a light host's children. **Phase 5:** a shadow host's light
  children are the parent's template content (slotted children, written after the host's
  `<template>`, 06), so the parent walks them. A light host (`data-gyral-light`, which stays
  on the host) is skipped whole; a template that gives it children other than whitespace is
  a mismatch. A custom element with no children in the template is skipped too: whatever it
  holds is its own (a third-party element may render into its light DOM).
- So `defer-hydration` is only used for **islands**, not for ordering nested components. The
  scheduler still hydrates parents first within a flush (04); that keeps work in a sensible order
  but isn't needed for correctness.

## Steps, per host

1. **Resume** (on connect, before the island check, 05): read and remove the seed. State is
   `seed.state` if present, else `init(props)`'s state. Props the seed carries are set unless
   the page already set them. `init`'s commands are kept for later.
2. **Render the first view** from that state (a template result), in the host's first render
   of a flush (04).
3. **Swap styles** (shadow roots): adopt the component's shared `CSSStyleSheet` and remove the
   server's `<style>` (the root's first child, when the component has CSS) in the same
   synchronous step as the walk (08). **Phase 5:** done just before the walk, so the walk
   starts at the view.
4. **Walk** the root and the template in parallel (below), building the instance's parts with
   their committed values. Nothing is written to the DOM except what the walk must create.
   `hydrate(value, root)` in `view/` (core's `hydrateRoot` adds the style swap and recovery).
5. **Run element hooks' `client` halves** once, with the hydrated arguments (02).
6. **Post-render** (04): the `Hydrated` message (with `serverRendered: true`), then the kept
   `init` commands start, so a driver that answers at once can't change state mid-hydration.

## The parallel walk

The walk visits the template's static structure and the server DOM together. It always knows
what comes next, because it has the template object and this render's values.

| Template has                 | DOM must have                                                | The walk                                                                             |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| static element               | an element with the same local name                          | records attribute and hook parts on it; descends                                     |
| static text                  | text                                                         | consumes exactly the static length (see merged text)                                 |
| anchor comment               | a comment                                                    | records it as the child part's reference node                                        |
| child hole: text value       | text                                                         | consumes exactly the value's length; creates an empty Text node if the value is `''` |
| child hole: template result  | that template's nodes                                        | recurses into the nested template                                                    |
| child hole: list             | each row's nodes in turn                                     | recurses per row; no per-row markers                                                 |
| child hole: `nothing`/`null` | nothing                                                      | records an empty part                                                                |
| child hole: `raw()`          | its start anchor, then nodes up to the hole's reference node | records the range                                                                    |
| nested Gyral host            | that element                                                 | records its parts on the host; walks a shadow host's light children only (above)     |

**svg templates** (0.3.1, 01 "svg templates") are walked like any template: the template's
content was parsed inside an `<svg>` and the server's markup inside the page's `<svg>`, so both
sides have SVG elements with the parser's names, and the walk's local-name check compares
`clipPath` with `clipPath` (case kept on both sides). Development markers before svg instances
are checked and removed as usual. In development, an svg template whose DOM parent isn't SVG
content is a mismatch ("expected an svg template inside SVG content"); production checks
structure only, as everywhere.

**Merged text.** The HTML parser joins adjacent text: `Hi ${name}!` arrives as one Text node
`Hi Bob` before the anchor. The walk splits it with `splitText` at the known lengths (static
`"Hi "`, then the value `"Bob"`). Lengths are known exactly: the parser decodes character
references, and the template's static text lengths come from the parsed template.

**Property parts** on nested Gyral hosts are recorded but not set when the child already has a
value for that prop from its own seed. The first real change sets them. **Phase 5:** "already
has a value" is read from the element (`el[name] !== undefined` on a custom element), so it
works whether the child hydrated first or hasn't upgraded yet (then the set is an own
property, which upgrade capture hands to the accessor, and the seed's copy is skipped, 05).
Property parts on other elements are set during the walk: no markup carries them.

**Form state** is never overwritten (decision F2). Adopted form-state parts take the model's
values as committed, and a form-state part writes only when the model's value for it changes
(02 "Live form state"), so a re-render with an unchanged model doesn't undo the user's edit:
`value`, `checked`, `selected`, `open` and textarea content keep what the user did before
scripts ran. The model's next change writes as usual. (Phase 5 held these parts with a flag
until the first change; since 2026-10-06 that is simply the rule for every render.)
`?indeterminate` is the exception: no attribute carries it (06), so the walk sets the property
from the model (the user can't set it; a click clears it). `?open` is kept too: the user may
toggle a `<details>` before scripts run.

### The walk's algorithm (Phase 5)

`view/render/adopt.ts`, with per-template data in `adopt-plan.ts`:

- **Per template, once:** the plan's targets (01 "Instantiation") are walked in the template's
  own parsed content to find, for each static element, its attribute/hook/text parts, and for
  each parent node (element or the content root) its child holes in order (each with its
  reference index). The template content is then walked node by node, side by side with a DOM
  cursor (the next server node and its parent): no TreeWalker, no comment search.
- **Holes:** before template child _j_, the hole whose reference index is _j_ (at most one, by
  the anchor rule) adopts its value at the cursor; its reference node is the DOM node the
  cursor reached, which the next static node then checks. A root-level hole with a `null`
  reference becomes the instance's tail, positioned by its owner, as on the client.
- **Text:** a static text or text value consumes exactly its length (CR/CRLF counted as LF, as
  the parser reads them): the Text node is split with `splitText` when longer, and joined with
  following Text nodes when shorter (the parser splits very long runs). `''` creates an empty
  Text node before the cursor. So the hydrated DOM has exactly the client renderer's Text nodes,
  boundaries included (the conformance property checks this).
- **Instances:** a `<!--gyral:ID-->` comment at an instance's start is checked (development)
  and **removed** in either build, so markers never linger as stray siblings after rows move
  or instances change. No marker: no check, no error (a development client may hydrate
  production output). A template object without an id (production client builds, 01
  "Template ids") consumes the marker without a check: hydration there is structural, the
  production rule.
- **Lists and arrays:** rows adopt one after another; `each` rows record key, item and pick
  as a client render would, so the first update skips unchanged rows.
- **`raw()`:** the start anchor, then as many nodes as the markup parses to on its own (a
  `<template>` parse, as the client does): non-text nodes by node name, text by length.
- **Elements:** the local name must match; parts are adopted (`adoptAttr` in `adopt-attr.ts`:
  committed values set, nothing written); then the children are walked unless a text part owns
  them (`<textarea>`, `<title>`), the element is a light host, or it is a custom element without
  template children. Server-only attributes on nested hosts (`data-gyral-seed`,
  `data-gyral-light`, `defer-hydration`, `data-gyral-hydrate`) are never compared: the walk
  checks bound attributes only, never the static attribute set (hooks' server halves and
  third parties add attributes).

### The server markup the walk meets (from Phase 4)

What `@gyral/core/server` writes (06), as input for the walk. The points left open in Phase 4
are resolved (marked **Phase 5**).

- A host's root starts with its view: in a shadow root after the one `<style>` (when the
  component has CSS), in a light host right after its start tag. In development the view is
  preceded by `<!--gyral:ID-->`, and so is every nested instance (rows and array items too).
- Anchors are exactly the template HTML's; `raw()` adds its own start anchor `<!---->` before
  the markup; empty strings and `nothing` write nothing; lists write no markers. Page shells
  (`server` templates, never walked) carry no anchors, nor do `raw()` values in their holes.
- Adjacent text is merged by the parser (`Hi ${name}!` → one Text node before the anchor).
- Seeds are single-quoted JSON (`&`, `'`, `<` and `>` escaped); `<gyral-stores>` carries its
  own seed in a double-quoted `data-gyral-stores`.
- Islands carry `defer-hydration data-gyral-hydrate="…"`; nested components never get
  `defer-hydration`.
- A light host's whitespace-only children (from the parent's template) are dropped.
- `?indeterminate` writes nothing; `value`, `checked`, `selected`, `open` and textarea
  content are attributes or text from the model.
- **Phase 5 (resolved):** children a parent writes inside a nested **shadow** host (slotted
  content) are the parent's template content, after the host's `<template>`: the parent's
  walk descends into the host's light children, never its shadow root. Light hosts' own
  content stays opaque.
- **Phase 5 (resolved):** development markers depend on the server's mode (06 "Development
  markers"). Rule: a marker present is consumed and (in development) checked; no marker means
  no id check and no error. Production clients consume markers too (development output
  served to a production client still hydrates). Tested both ways.
- **Phase 5 (resolved):** a nested host's `data-gyral-seed`, `data-gyral-light`,
  `defer-hydration` and `data-gyral-hydrate` are not template attributes; the walk only
  checks bound attributes, so it never sees them.

## Mismatches

Causes that remain once templates are shared: a view that isn't deterministic (`Date.now()`,
locale differences), third parties changing the DOM before scripts run (translation, password
managers, extensions, CDN email obfuscation), or a stale cached page served with a new
deployment.

| Mode        | Detection                                                                                                            | On mismatch                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| development | every row of the walk table above, plus the template id comment before each instance (06) and text content of values | **throw** `HydrationMismatch` with the tag, the template's `loc` when it has one (01), the path, and expected vs found              |
| production  | structural only: node type and local name at each step, and enough text length                                       | **recover this component only:** `replaceChildren()` on its root, render fresh, log a warning. The rest of the page stays hydrated. |

**Phase 5 notes:**

- Development also checks bound attribute values (`name=`, multi, `?name`, form-state
  attributes and textarea/title text against the defaults user edits don't change; not
  `?open`). Production checks no attribute and writes none: a differing attribute stays until
  its value next changes.
- Extra nodes are structural: a missing node, an extra child at the end of an element, or
  content after the view all count in both builds.
- The thrown error is caught by the scheduler like any render error (04 "Errors"): it is
  logged with the tag, the host keeps the server DOM, and the next render tries again. The
  devtools hook gets a `mismatch` event (development builds; production has no hook).
- Messages, for example:
  `gyral: hydration mismatch in <shop-cart> at ul[1] › li[2] › #text[0]: expected text "3", found text "4".`
  Development adds the explanation; production keeps the path and the expected/found part (useful in
  field reports). The `(template at file:line:col)` part appears for a template object that
  carries `loc`: development runtime templates do since 0.3.1 (01 "Source locations"); compiled
  and production ones don't, so there the tag and path locate the mismatch.

No in-place patching of a mismatched DOM: rebuilding one component is simple and predictable.

## Islands

- `hydrate: 'idle' | 'visible' | 'interaction'` (ADR 0012 addendum, kept). The server writes
  `defer-hydration` and `data-gyral-hydrate` (06).
- On connect, a deferred host schedules its release and does nothing else:
  - `idle`: `requestIdleCallback` where present, otherwise a short `setTimeout` (tier 2 inline
    fallback, ADR 0003).
  - `visible`: `IntersectionObserver`, disconnected after the first intersection.
  - `interaction`: the first `pointerover`, `pointerdown`, `focusin` or `touchstart` on the host
    (capture), which arrive before the click itself.
- Release removes both attributes; `attributeChangedCallback` then hydrates the host (05).
- Islands may now sit anywhere, not only at page level: a parent's walk no longer touches a
  child's `defer-hydration` (ADR 0012's restriction goes). **Phase 5:** the other direction
  holds too: a component inside a pending island is connected (its shadow root is in the
  document), so it hydrates on its own at load; only the island itself waits. Put widgets
  that should wait inside the island's own view as islands too.

## Preloads under a service worker (gyral-dyn.11, 0.3.1)

Preloads are a server choice per response: `modulepreload: []` drops them and the page still
hydrates (the chunk loads when the first seeded host connects, "Loading" above). A PWA whose
service worker serves the modules hit Chromium warning that a module preloaded outside the
worker went unused, so it was fetched twice (game-platform feedback item 9). A server can tell
the navigations the worker handles by the `Service-Worker-Navigation-Preload` header (sent
when the worker enables navigation preload) or a marker the worker adds, and leave the
preloads out for those, with `Vary` on that header. The recipe is in the skill's ssr.md
"Preloads under a service worker". No API change: emitting preloads only when no worker
controls the page can't be decided by the server without such a signal.

## Testing

- `@gyral/testing`'s `mountSsr` keeps parsing server output with `setHTMLUnsafe` (Chromium-only
  tests; newly available is fine there).
- `hydrated()` releases islands if asked, then awaits `settled()` (04).
- Every hydration test runs against development and production builds of core (the
  `browser-prod` Vitest project stays).
- **Phase 5:** `core/test/view/walk-hydration.test.ts` (the walk), `mismatch-hydration.test.ts`
  (each mismatch kind per build, one host recovered with siblings hydrated),
  `conformance-hydration.test.ts` (README property 2), `core/test/element-hydration.test.ts`
  (hosts, style swap, child-first and parent-first order, islands), the `@gyral/ssr` suites
  and the examples' hydration tests (both projects), and `pnpm smoke:prod`, which now also
  checks that every element the parser built is still in the page after hydration.
- **Size:** Phase 5 added hydration to every client bundle (about 1.8 KiB gzip); since
  gyral-g1r.18 it loads lazily ("Loading"), so a client-only app's initial chunk carries none
  of it and only server-rendered pages fetch the separate chunk, preloaded by the server
  ("Loading", gyral-g1r.21). Measured sizes: ADR 0018 "Size pass" and "Result".
  `loading-hydration.test.ts` checks both sides.

## Native primitives

| Need                | Primitive                                 | Baseline                                    |
| ------------------- | ----------------------------------------- | ------------------------------------------- |
| Server shadow roots | declarative shadow DOM, `this.shadowRoot` | widely (since 2026-08-20)                   |
| Walking             | `firstChild`/`nextSibling`, `splitText`   | widely                                      |
| Recovery            | `replaceChildren()`                       | widely                                      |
| `visible` islands   | `IntersectionObserver`                    | widely                                      |
| `idle` islands      | `requestIdleCallback`                     | not Baseline → inline `setTimeout` fallback |
| Test parsing        | `setHTMLUnsafe`                           | newly (tests only, Chromium)                |

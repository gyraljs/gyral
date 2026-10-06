# 07 — Hydration

Status: **accepted** (2026-10-06), implemented in Phase 5 (gyral-g1r.10; implementation notes
and resolved points marked "Phase 5"). ADR 0018 (decision F). Replaces the Lit parts of ADRs
0012 and 0014.

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
- **Preloading (gyral-g1r.21):** a server-rendered page knows it will need the chunk, so the
  server says so up front. `clientAssetsFromManifest(manifest, entry)` (`@gyral/ssr/static`)
  reads Vite's build manifest and returns the entry's URL plus `modulepreload`: the entry's
  static imports (depth first) and the hydration chunk (the dynamic import whose source is
  core's `hydration-client`, from `packages/core/src/` or an installed `@gyral/core/dist/`)
  with its own imports. The app's own lazy chunks are not included. `page({ modulepreload })`
  writes one `<link rel="modulepreload">` per URL before the module scripts, and
  `productionServer` hands the list to `createApp`. The browser then fetches the entry, its
  imports and the hydration chunk in parallel, instead of the entry, then its imports, then
  the chunk once the first seeded host connects. No bytes change; client-only pages, which
  aren't rendered by `page()`, still never fetch the chunk. Checked by the isomorphic
  example's production test (`examples/isomorphic/test/prod.node.test.ts`) and
  `packages/ssr/test/modulepreload.node.test.ts`.

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

**Form state** is never overwritten (decision F2). Adopted form-state parts are flagged so the
live comparison (02) is skipped until the model's value for that part changes; a re-render with
an unchanged model must not undo the user's edit: `value`, `checked`, `selected`, `open` and
textarea content keep what the user did before scripts ran. The model's next change writes as
usual. **Phase 5:** the flag (`held`) is cleared by the first render whose value for that part
differs from the adopted one; from then on the part compares live as always.
`?indeterminate` is the exception: no attribute carries it (06), so the walk sets the property
from the model (the user can't set it; a click clears it). `?open` is held too: the user may
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
  production output).
- **Lists and arrays:** rows adopt one after another; `each` rows record key, item and pick
  as a client render would, so the first update skips unchanged rows.
- **`raw()`:** the start anchor, then as many nodes as the markup parses to on its own (a
  `<template>` parse, as the client does): non-text nodes by node name, text by length.
- **Elements:** the local name must match; parts are adopted (`AttrPart.adopt`: committed
  values set, nothing written); then the children are walked unless a text part owns them
  (`<textarea>`, `<title>`), the element is a light host, or it is a custom element without
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
  the markup; empty strings and `nothing` write nothing; lists write no markers.
- Adjacent text is merged by the parser (`Hi ${name}!` → one Text node before the anchor).
- Seeds are single-quoted JSON (`&` and `'` escaped); `<gyral-stores>` carries its own seed
  in a double-quoted `data-gyral-stores`.
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

| Mode        | Detection                                                                                                            | On mismatch                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| development | every row of the walk table above, plus the template id comment before each instance (06) and text content of values | **throw** `HydrationMismatch` with the tag, the template's `loc` (01), the path, and expected vs found                                                     |
| production  | structural only: node type and local name at each step, and enough text length                                       | **recover this component only:** `replaceChildren()` on its root, render fresh, log a warning (and a devtools event). The rest of the page stays hydrated. |

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
- Messages: `gyral: hydration mismatch in <shop-cart> (template at src/cart.ts:12:5) at
ul[1] › li[2] › #text[0]: expected text "3", found text "4".` Production keeps the path and
  the expected/found part (useful in field reports) without the explanation.

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

## Testing

- `@gyral/testing`'s `mountSsr` keeps parsing server output with `setHTMLUnsafe` (Chromium-only
  tests; newly available is fine there).
- `hydrated()` becomes: release islands if asked, then `await settled()` (04).
- Every hydration test runs against development and production builds of core (the
  `browser-prod` Vitest project stays).
- **Phase 5:** `core/test/view/walk-hydration.test.ts` (the walk), `mismatch-hydration.test.ts`
  (each mismatch kind per build, one host recovered with siblings hydrated),
  `conformance-hydration.test.ts` (README property 2), `core/test/element-hydration.test.ts`
  (hosts, style swap, child-first and parent-first order, islands), the `@gyral/ssr` suites
  and the examples' hydration tests (both projects), and `pnpm smoke:prod`, which now also
  checks that every element the parser built is still in the page after hydration.
- **Phase 5, size:** hydration added about 1.8 KiB gzip to every client bundle (the view line
  went from 5.47 to 7.22 KiB), whether the app server-rendered or not. **gyral-g1r.18:** it now
  loads lazily ("Loading"): a client-only app's initial chunk carries none of it (hello-world's
  initial chunk 10.3 → 9.1 KiB gzip when it landed). The separate chunk is about 2.8 KiB gzip and is fetched
  only by server-rendered pages; split from the main chunk it compresses worse, so all chunks
  together are about 1 KiB larger than one bundle, and a server-rendered page fetches it one
  round trip after the entry, unless the server preloads it ("Loading", gyral-g1r.21).
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

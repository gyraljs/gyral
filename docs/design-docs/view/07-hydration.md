# 07 — Hydration

Status: **accepted** (2026-10-06). ADR 0018 (decision F). Phase 5. Replaces the Lit parts of
ADRs 0012 and 0014.

Hydration is built into core. There is no separate hydrate-support import, nothing patches a
class at load time, and module evaluation order can't break it.

## Which hosts hydrate

A host hydrates when it connects with a `data-gyral-seed` attribute: the server always writes
one (06). Its root is its declarative shadow root, or the host itself in light-DOM mode.

## Each component hydrates on its own

- The client already has everything a component's first render needs: its state (seed, or
  `init(props)`), its props (attributes plus the seed's carried props) and its view. So each
  host hydrates **independently**, whether its parent has hydrated yet or not.
- A parent's walk treats a nested Gyral host as one opaque element: it never walks into the
  child's shadow root or light children.
- So `defer-hydration` is only used for **islands**, not for ordering nested components. The
  scheduler still hydrates parents first within a flush (04); that keeps work in a sensible order
  but isn't needed for correctness.

## Steps, per host

1. **Resume:** read and remove the seed. State is `seed.state` if present, else `init(props)`'s
   state. Props the seed carries are set unless the page already set them. `init`'s commands are
   kept for later.
2. **Render the first view** from that state (a template result).
3. **Walk** the root and the template in parallel (below), building the instance's parts with
   their committed values. Nothing is written to the DOM except what the walk must create.
4. **Run element hooks' `client` halves** once, with the hydrated arguments (02).
5. **Swap styles** (shadow roots): adopt the component's shared `CSSStyleSheet` and remove the
   server's `<style>` in the same step (08).
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
| nested Gyral host            | that element                                                 | records its parts on the host element; does not descend                              |

**Merged text.** The HTML parser joins adjacent text: `Hi ${name}!` arrives as one Text node
`Hi Bob` before the anchor. The walk splits it with `splitText` at the known lengths (static
`"Hi "`, then the value `"Bob"`). Lengths are known exactly: the parser decodes character
references, and the template's static text lengths come from the parsed template.

**Property parts** on nested Gyral hosts are recorded but not set when the child already has a
value for that prop from its own seed. The first real change sets them.

**Form state** is never overwritten (decision F2): `value`, `checked`, `selected`,
`indeterminate` and textarea content keep what the user did before scripts ran. The model's next
change writes as usual.

## Mismatches

Causes that remain once templates are shared: a view that isn't deterministic (`Date.now()`,
locale differences), third parties changing the DOM before scripts run (translation, password
managers, extensions, CDN email obfuscation), or a stale cached page served with a new
deployment.

| Mode        | Detection                                                                                                            | On mismatch                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| development | every row of the walk table above, plus the template id comment before each instance (06) and text content of values | **throw** `HydrationMismatch` with the tag, the template's `loc` (01), the path, and expected vs found                                                     |
| production  | structural only: node type and local name at each step, and enough text length                                       | **recover this component only:** `replaceChildren()` on its root, render fresh, log a warning (and a devtools event). The rest of the page stays hydrated. |

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
  child's `defer-hydration` (ADR 0012's restriction goes).

## Testing

- `@gyral/testing`'s `mountSsr` keeps parsing server output with `setHTMLUnsafe` (Chromium-only
  tests; newly available is fine there).
- `hydrated()` becomes: release islands if asked, then `await settled()` (04).
- Every hydration test runs against development and production builds of core (the
  `browser-prod` Vitest project stays).

## Native primitives

| Need                | Primitive                                 | Baseline                                    |
| ------------------- | ----------------------------------------- | ------------------------------------------- |
| Server shadow roots | declarative shadow DOM, `this.shadowRoot` | widely (since 2026-08-20)                   |
| Walking             | `firstChild`/`nextSibling`, `splitText`   | widely                                      |
| Recovery            | `replaceChildren()`                       | widely                                      |
| `visible` islands   | `IntersectionObserver`                    | widely                                      |
| `idle` islands      | `requestIdleCallback`                     | not Baseline → inline `setTimeout` fallback |
| Test parsing        | `setHTMLUnsafe`                           | newly (tests only, Chromium)                |

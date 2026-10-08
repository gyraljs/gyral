# ADR 0019 — A head model shared by the page shell and the router

Status: **proposed** (2026-10-08), for **0.3.1**. Bead: gyral-dyn.9. Builds on ADR 0009
(router: the "document titles" and "canonical paths" addenda), ADR 0012 (SSR) and
view/06-server.md.

**Scope note (owner, 2026-10-08):** the 0.4 items ship in 0.3.1, and breaking a 0.3.0 API is
acceptable this once (0.3.0 is not yet approved on npm). This ADR recommends the cleanest
design and lists what breaks.

## Context

A server-rendered page and a client-side navigation should leave the same `<head>`. Today
they share only the title:

- **Server.** `page({ title, description, head })` writes `<title>`, an optional
  `<meta name="description">`, and `head`, an opaque `ChildValue` the app writes by hand with
  `html`. Canonical links, robots rules, Open Graph tags, `hreflang` alternates and JSON-LD
  all go into that opaque value, so nothing on the client knows they exist.
- **Client.** The router's only head command is `setTitle(title)` (ADR 0009 "Document
  titles"). After a client navigation, the canonical link, the description and the JSON-LD
  still describe the first page the browser loaded. Search engines that render JavaScript
  index that stale head, and so do link-preview bots that run scripts.
- **Apps fill the gap themselves.** A typical workaround is an app-level head driver of about
  90 lines that marks the elements it manages and replaces them on navigation. Every app that
  routes on the client needs the same thing, and each writes its own server half to match.

Two facts constrain the design:

1. **The server writes the head before the body.** `renderPage` pulls the page in chunks
   (view/06 "How the walk is chunked"), and the head is in the first chunk. The head can
   depend on data the route handler loaded, but not on anything components compute while
   they render.
2. **`@gyral/ssr` depends only on core** (its `package.json`), so a type both halves share
   belongs in core, not in the router.

## Options

### Who owns the head

| Option                                                                   | Server                                                                         | Client                                                                  | Verdict                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| **A. The page owns it:** one pure `pageHead(match, data)` per app        | `page({ ...pageHead(…) })`                                                     | `setHead(pageHead(…))` from the reducer that has the route and data     | **Recommended**                                        |
| B. Components contribute (`spec.head(state, props)`, deepest key wins)   | The body must render before the head: buffer the page, lose chunked output     | A registry that merges every connected component's head on every render | Rejected (see below)                                   |
| C. A head store (ADR 0013) that any component writes and the shell reads | Same as B: the store is written during the body render, after the head is sent | Store watcher applies the head                                          | Rejected: B's server problem with an extra indirection |

Option B is how several component frameworks do it, and it has real appeal: a product card
deep in the tree knows the product name. But in Gyral a component's state starts from
`init(props)`, and those props come from the route handler, which already has the data. So
the page can compute the same head from the same data, before the body. B would also add a
client merge registry (ordering across islands, components that disconnect mid-navigation)
to every app, and would let a child change page-level output, which runs against "props
down, outputs up" (ADR 0010). If a real need appears, B can be added on top of A, because A's
keys and dedupe rules are what B's merge would need anyway.

### Where the client half lives

| Option                                                     | Verdict                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`setHead()` in `@gyral/router`**, replacing `setTitle()` | **Recommended.** The router already owns `document.title`. Its memory history records the head instead of touching the document, so tests and servers stay isolated (ADR 0009 "Memory history"). |
| A core marker driver (`head(…)`, like `focus()`)           | Works without the router, but then the memory history can't intercept it, and tests that route in memory would write the real document's head.                                                   |
| A new `@gyral/head` package                                | Clean boundaries, but one more package to version for about 0.5 KiB of code.                                                                                                                     |

## Decision (recommended)

### One data model, in core

```ts
// @gyral/core: types and a pure normalizer only (no DOM), shared by both halves.
export interface Head {
  readonly title: string;
  readonly description?: string;
  /** Absolute URL, usually `new URL(match.path, origin).href` (ADR 0009 "Canonical paths"). */
  readonly canonical?: string;
  /** `<meta name="robots">`, e.g. `'noindex, follow'`. */
  readonly robots?: string;
  /** `{ name, content }` or `{ property, content }` (Open Graph uses `property`). */
  readonly meta?: readonly HeadMeta[];
  /** Metadata links: `alternate` (`hreflang`), `icon`, `manifest`, `prev`/`next`, … */
  readonly links?: readonly HeadLink[];
  /** Structured data, each written as one `<script type="application/ld+json">`. */
  readonly jsonLd?: readonly JsonValue[];
  /** `<html lang dir>`: a client navigation between languages updates them too. */
  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
}
```

`headEntries(head)` (core, pure) turns a `Head` into an ordered, deduplicated list of
`[key, element]` entries. The server and the client both use it, so they can't disagree about
order or duplicates.

### Server: `PageOptions extends Head`

`page()` already takes `title`, `description`, `lang` and `dir`. It gains the other `Head`
fields, so the same object feeds both halves. The opaque head content is renamed
`extraHead`, so `head` no longer means two things next to a type called `Head`:

```ts
// Route handler (server)
const match = site.match(url);
const head = pageHead(match, product, ORIGIN);
return renderPage({ ...head, body: html`<shop-product …></shop-product>`, scripts }, { status });
```

Each managed element is written with `data-gyral-head="<key>"`, right after `<title>`:
description, robots, canonical, `meta` in the given order, `links` in the given order, then
JSON-LD. Stylesheets, `styles`, `extraHead`, the store seed and scripts follow as today, so
`extraHead` covers anything the model doesn't. JSON-LD is serialized
with core's `scriptSafeJson` (so `</script>` and `<!--` in a string can't end the element).

### Client: `setHead(head)` in `@gyral/router`

```ts
update: {
  Routed: (s, { location }) => {
    const match = site.match(location.href);
    return [{ ...s, match }, [setHead(pageHead(match, s.product, ORIGIN))]];
  },
  // Data that arrives after the navigation updates the head again.
  ProductLoaded: (s, { product }) => [{ ...s, product }, [setHead(pageHead(s.match, product, ORIGIN))]],
},
```

- **Replace, not patch.** `setHead` states the whole managed head: every managed element not
  in the new `Head` is removed, so a `noindex` or a JSON-LD block from the previous page can't
  linger. Elements without `data-gyral-head` (`extraHead` content, styles, scripts)
  are never touched.
- **Keyed and minimal.** Elements are matched by key; an element whose attributes and text
  are unchanged is not written. The first `Routed` after hydration (`location.seq === 0`)
  therefore adopts the server's elements and writes nothing.
- **`setTitle(title)` is removed:** `setHead({ title })` does the same for an app with no
  other managed elements, and one command means one rule ("the head is now this").
- `lang` and `dir`, when given, are set on `document.documentElement`.
- **Memory history:** `snapshot().head` records the last `Head`; the document is untouched.
- **Registration:** the applier is reached through a slot that `setHead()` fills when first
  called (the "features register themselves" pattern, view/05), so router apps that never set
  a head don't bundle it.

### Keys, dedupe and order

| Entry                   | Key                                      | Notes                                                                                    |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `title`                 | `<title>` itself                         | Set with `document.title` on the client                                                  |
| `description`, `robots` | `name:description`, `name:robots`        | Typed fields are applied after `meta`, so they win over a `meta` entry with the same key |
| `meta`                  | `name:<name>` or `property:<property>`   | Later entries win: `meta: [...siteDefaults, ...pageMeta]` is how defaults merge          |
| `canonical`             | `canonical`                              | `rel=canonical` in `links` is a development error                                        |
| `links`                 | `rel` plus every attribute except `href` | `alternate hreflang=fr` updates its `href` in place; later entries win                   |
| `jsonLd`                | position (`ld:0`, `ld:1`, …)             | Text compared before writing                                                             |

Refused in `meta`/`links` (development error, dropped in production): `charset`, `viewport`,
`http-equiv` (a CSP or refresh in `<meta>` is a server concern, not a per-navigation one) and
the resource rels `stylesheet`, `preload` and `modulepreload` (removing one on navigation
would unstyle the page or refetch modules; they belong to `page()`'s own options).

### Relation to `Routed` and `match().path`

- The router still knows nothing about route data: `Routed` stays the app's message, and the
  app's `pageHead` is the single source, exactly as `pageTitle` is today (ADR 0009). That
  addendum's pattern generalizes from a title to a head.
- **Canonical URLs come from `match().path`.** The path the server redirects to (ADR 0009
  "Canonical paths") is the path the canonical link names, so the two can't drift. The query
  is dropped unless the app keeps it (pagination, for example).
- **The origin is configuration**, not the request's `Host` header, which a proxy or client
  can set. `canonical` must be absolute; development warns on a relative one.
- **Unknown routes:** the server answers 404 with `robots: 'noindex'`; a client navigation to
  an unknown route sets the same head.

### CSP

JSON-LD needs no CSP allowance: a `<script>` whose type is not a JavaScript MIME type is a
data block, which the HTML "prepare the script element" steps return from before any CSP
check, so `script-src` never applies. Gyral already relies on this for the store seed
(`type="application/json"`, ADR 0012 "CSP"). The test plan verifies it under a strict
`script-src 'self'` in all three engines. Where Trusted Types is enforced
(`require-trusted-types-for 'script'`), setting a script element's text on the client may need
a `TrustedScript` even for a data block; see open question 5.

## Size

| Where                                 | Estimate (gzip)                                        | Basis                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Apps that call `setHead`              | +0.45 to +0.6 KiB                                      | A sketch of normalizer plus keyed applier measured 0.62 KiB alone (esbuild, minified); inside an app bundle it compresses with the rest |
| Router apps that never call `setHead` | about 0 (the `Title` case goes, a slot comes)          | The applier is registered by `setHead()`                                                                                                |
| Apps without the router               | 0                                                      | Types only in core                                                                                                                      |
| Server                                | no client cost; `page()` grows by the serializer       |                                                                                                                                         |
| Page bytes                            | about 18 B per managed element (`data-gyral-head="…"`) | Compresses well; 6 managed elements ≈ 110 B before gzip                                                                                 |

## Baseline and compatibility

- Everything the client half uses is widely available: `document.title`,
  `querySelectorAll`, `setAttribute`, `Element.after()`, `textContent`. No fallback tier.
- Data-block scripts are handled the same way by every engine.
- Hand-written `extraHead` content is not managed and is never removed.

## Breaking changes (0.3.0 → 0.3.1)

| Removed or changed                     | Replace with                                                       |
| -------------------------------------- | ------------------------------------------------------------------ |
| `setTitle(title)` (`@gyral/router`)    | `setHead({ title })`, or `setHead(pageHead(…))`                    |
| `RouterInput` `{ _tag: 'Title' }`      | `{ _tag: 'Head', head }` (custom router fakes)                     |
| `RouterSnapshot.title`                 | `snapshot().head?.title` (memory history) / `document.title`       |
| `page({ head })` (opaque head content) | `page({ extraHead })`; tags the model covers move to `Head` fields |

All are compile errors, so the type checker finds every site.

## Implementation plan (0.3.1)

| Step | Files                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `packages/core/src/head.ts` (new: `Head`, `HeadMeta`, `HeadLink`, `headEntries`), `index.ts`                                                                                    |
| 2    | `packages/ssr/src/page.ts` (`PageOptions extends Head`, managed elements, `extraHead`), `index.ts`                                                                              |
| 3    | `packages/router/src/index.ts` (`setHead`, `setTitle` removed), `driver.ts`, `memory.ts`, `source.ts` (`Head` input, snapshot), `internal/head.ts` (new: keyed applier, slot)   |
| 4    | `examples/isomorphic` and `examples/routing-view` (`pageHead` replaces `pageTitle`; canonical and robots on 404), their golden fixtures                                         |
| 5    | Docs: ADR 0009 addendum (head replaces titles), ADR 0012 note, skill `effects-and-drivers.md`, `ssr.md`, `anti-patterns.md`, router and ssr READMEs, migration notes, changeset |

Tests are listed below; size budgets for routing-view and isomorphic move by the measured
amount (estimate +0.4 to +0.55 KiB all chunks, since both examples will call `setHead`).

## Testing plan

- **Node:** `headEntries` (order, later-wins dedupe, typed fields over `meta`, refused
  entries), `page()` output for every field, escaping (`"` in content, `</script>` and
  `<!--` inside JSON-LD), a golden page for `examples/isomorphic`.
- **Browser (Chromium in `pnpm check`; Firefox and WebKit in the cross-browser config):**
  adopt server markup with zero mutations (a `MutationObserver` on `<head>` sees nothing on the
  first `Routed`); navigate and check inserts, in-place updates and removals; unmanaged
  elements untouched; `setHead({ title })` on a page with no managed elements writes only
  the title; `lang`/`dir` updates.
- **CSP:** a page served with `script-src 'self'` and JSON-LD fires no
  `securitypolicyviolation`, in all three engines.
- **Router:** memory history `snapshot().head`; `setHead` from a test component with
  `navigationApi: false` and with the Navigation API.
- **Round trip:** for each route of the isomorphic example, the server's managed head equals
  the head after a client navigation to the same URL (serialize both with `getHTML()`-style
  canonical output and compare).
- **Size:** `pnpm size` for routing-view and isomorphic before and after; budgets raised only
  by what the measurement shows.

## Open questions for the owner

1. **Where `setHead` lives.** (a) `@gyral/router`, memory history records it (recommended);
   (b) a core marker driver, usable without the router.
2. **Component-contributed heads.** (a) Not in 0.3.1, page-owned only (recommended);
   (b) a `spec.head` field merged by depth, with buffered server output.
3. **`canonical`.** (a) Absolute URLs only, development warns on a path (recommended);
   (b) resolve paths against a new `origin` option.
4. **JSON-LD under enforced Trusted Types.** (a) Skip client JSON-LD updates with a
   development warning (recommended: crawlers read the server's); (b) accept a Trusted Types
   policy option.
5. **Marker.** (a) `data-gyral-head` per element (recommended); (b) one count `<meta>`,
   fewer bytes but fragile when other code inserts into the head.

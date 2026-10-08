# ADR 0009 — Router: typed routes, navigation as commands, streaming `listen`

Status: **accepted** (2026-10-04). Bead: gyral-ud5.2. Builds on ADR 0003 and ADR 0006.

## Decision

### Route tables are pure and typed

```ts
const app = routes({ home: '/', user: '/users/:id' });
app.match('/users/7'); // { name: 'user', params: { id: '7' }, path: '/users/7' } | undefined
app.href('user', { id: 'a b' }); // '/users/a%20b'
```

- Matching never touches `window`, so the same table serves SSR (gyral-4k7).
- Patterns are **literal segments and `:param` only**. `routes()` rejects URLPattern-only
  syntax (`*`, `?`, groups, regex) so both matchers behave identically. One trailing slash is
  ignored (the match's `path` is the canonical spelling, see "Canonical paths" below); params
  are percent-decoded; first match in table order wins.
- URLPattern is used when present (it is not Baseline widely available); otherwise a small
  segment matcher. Tests run the same table through both.

### Navigation is commands (ADR 0006)

`navigate(url, { replace })`, `back()`, `forward()`, `go(delta)` return commands for the
`router` driver (a plain object; substitute with `el.drivers = { router: makeRouter({...}) }`).

| Concern           | Baseline (History API)                    | Enhancement (Navigation API, feature-detected)                                                                   |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Navigate          | `pushState` / `replaceState`, then notify | `navigation.navigate()` with a private `info` token; only those navigations are intercepted (kept same-document) |
| Back/forward      | `history.go()` → `popstate`               | `history.go()` → `currententrychange`                                                                            |
| URL change signal | `popstate` + our own pushes               | `currententrychange`                                                                                             |
| Link clicks       | captured on `document` (both modes)       | same                                                                                                             |

Link capture skips: already-prevented clicks, modified or non-primary clicks, `target`
other than `_self`, `download`, `rel="external"`, other origins and same-page hash links.
It looks through `composedPath()`, so anchors inside shadow roots work. `makeRouter({
navigationApi: false })` forces the baseline; `captureLinks: false` disables capture.
Listeners are installed on first use, never at import time (safe to import on a server).

### Incoming URL changes (original design: a re-armed `listen`; superseded below)

The interpreter runs a driver once and dispatches once per command, so a driver cannot
stream. `listen(toMsg, after?)` is a long-poll:

```ts
init: () => [initial, [listen(toRouted)]],                    // delivers the current location
update: {
  Routed: (s, m) => [{ ...s, route: app.match(m.location.href) }, [listen(toRouted, m.location)]],
}
```

- Every `RouteLocation` carries a `seq`. `listen(…, after)` resolves immediately if the
  router has seen a change after `after.seq`, so changes between delivery and re-arming are
  never lost (several quick changes collapse into the latest).
- `listen` uses lane `router:listen` with `switch`, so re-arming replaces the old waiter.
  Disconnecting the element aborts it (ADR 0006 lifecycle).

### Streaming (adopted, gyral-ud5.4)

The re-arming long-poll described above was replaced once `DriverContext.emit` landed
(ADR 0006, "Streaming drivers"). `listen(toMsg)` is now one long-running command: it emits
the current location immediately, then every change, until the component disconnects. The
`after` parameter and `Listen.since` are gone. `RouteLocation.seq` remains as an ordering aid.

## Consequences

- Routing works with neither URLPattern nor the Navigation API (tested by forcing both off).
- Components own their routing state: the route is model state derived from `RouteLocation`.
- SSR will call `app.match(requestUrl)` directly and seed the initial route.

## Addendum: memory history (gyral-ud5.5, 2026-10-04)

`makeRouter({ history: 'memory', initial: '/about', origin?, linkRoot? })` keeps history entries
in memory: push, replace and `go(n)` (clamped at both ends) work as in a browser, `listen()`
streams the same way, and the real `window.location` and `document.title` are never touched.
Uses:

- **Tests:** no global URL mutation to set up and restore (`examples/routing-view` tests).
- **Servers:** routing without `window` (`linkRoot: null`); the browser history still resolves
  `window` lazily, so importing the router on a server is safe either way.

Link capture listens on `linkRoot` (default: the global `document` when there is one). Links are
resolved from their `href` **attribute** against the router's own location, not the document's
`anchor.href`, so memory history captures in-app links even though the real page has another
origin. The browser history uses the same rule (a `<base href>` element is not consulted).

`driver.snapshot()` returns `{ href, title, length }` as the router sees them, for assertions.

## Addendum: document titles (gyral-ud5.6, 2026-10-04)

Decision: a **`setTitle(title)` command**, not a `title` field in the route table. Titles often
depend on data (a product name), not only on the route, so they are computed by a pure
`pageTitle(…)` function of state. The server's document template calls the same function for
`<title>`, which keeps server and client titles from one source (`examples/isomorphic`).
Reducers return `setTitle(pageTitle(…))` alongside the new state, usually from `Routed`. The
browser history sets `document.title`; the memory history records it in `snapshot().title`.

## Addendum: link capture is opt-in (gyral-ud5.8, 2026-10-04)

The default `router` captured every same-origin link click on the page. In a multi-page
server-rendered app where only one component routes (gyral-shop's category listing), that
silently turned every link on the site into a client-side navigation. **`captureLinks` now
defaults to `false`** in both histories:

- Browser history: `makeRouter({ captureLinks: true })` to intercept same-origin links.
- Memory history: `captureLinks: true` captures on `document`; `linkRoot: element` captures
  on that element (and turns capture on); `linkRoot: null` turns it off.
- `navigate()`, `back()` and `listen()` are unaffected: routing commands still work without
  capture.

**Migration:** an app that owns the whole page passes its own router:
`define(…, { drivers: { router: makeRouter({ captureLinks: true }) }, … })`, as
`examples/routing-view` and `examples/isomorphic` now do. Tests that click links on a memory
router add `captureLinks: true`.

## Addendum: capture only while listening (gyral-ud5.10, 2026-10-05)

gyral-shop's admin tests found a leak: a memory router with `captureLinks` kept its `document`
click listener until `dispose()`, so a leftover router from an earlier test claimed clicks
(`preventDefault`) and the next router silently skipped them.

Link capture is now tied to the router's listeners. The click listener is added when the first
`listen()` stream starts and removed when the last one ends (its component disconnected), and
added again for the next listener. A router nobody listens to never captures, whether or not
anyone calls `dispose()`. `dispose()` still removes everything at once.

- **Scoping:** `linkRoot` now applies to both histories. An element limits capture to its
  subtree (and turns capture on); `null` turns it off; the default with `captureLinks: true` is
  the document.
- **Overlap warning:** when two routers capture on the same root at the same time, a console
  warning says so, since only the first to see a click navigates.
- **Migration:** apps that relied on a router capturing clicks before any component listened
  must start a `listen()` stream first (every routing component already does). Tests that
  created routers without disposing them no longer leak.

## Addendum: canonical paths, empty segments (gyral-dyn.3, 2026-10-08)

A game-platform team on Gyral found that a page answers at `/games/x` and `/games/x/` alike
(one trailing slash is ignored, by design) while `match()` returned only `{ name, params }`, so
each app hand-wrote a `pathOf(page)` to redirect to one URL. And the fallback matcher dropped
empty segments, so `/games//x` matched `/games/:id` there but not under URLPattern, against
"both matchers behave identically".

- **`match()` returns `path`**, the canonical path: `href(name, params)`. It differs from the
  URL's pathname when the URL had a trailing slash, lowercase percent-escapes
  (`j%c3%bcrgen` → `j%C3%BCrgen`) or characters `href()` encodes (`a@b` → `a%40b`). It is a
  fixed point: `match(m.path)` gives the same match. No separate `canonical(url)` helper: the
  redirect is three lines and keeps the app's choice of status and query handling.

  ```ts
  // In the server's request handler, before rendering:
  const m = site.match(url);
  if (m !== undefined && m.path !== url.pathname) {
    return Response.redirect(new URL(m.path + url.search, url), 301);
  }
  ```

  A client that wants the address bar canonical too answers `Routed` with
  `navigate(m.path + location.search + location.hash, { replace: true })` when they differ.

- **Empty segments never match.** The fallback splits on every `/` (an empty segment is a
  segment) and rejects an empty param value, as URLPattern does: `/users//7`, `//users/7` and
  `/users//` match no route in either matcher. Only one trailing slash is dropped before
  matching (`//` matches `/`, and its `path` is `/`).
- **A string starting with `/` is a path.** `match('//users/7')` used to parse `users` as a
  host; servers that pass `url.pathname` now match what the browser asked for.
- **Patterns the matchers would read differently are rejected**: empty, `.` or `..` segments
  (also as `%2e`), a `:` inside a segment (`/v:id`; URLPattern reads a param there), a param
  name that isn't an identifier (`:post-id` is the param `post` then the literal `-id` to
  URLPattern), a param named twice, and `#`. Literal segments are stored as a URL spells them
  (`/café` → `/caf%C3%A9`, as URLPattern canonicalizes them), so `href()` and `path` emit the
  encoded form.
- **Tested** by `test/agreement.ts`: one table through both matchers over ~56,000 generated
  paths (up to three segments from a pool with empty, dot, encoded and case-variant segments,
  each with five endings), in Chromium and in Node 24, whose URLPattern implementations differ;
  every match's `path` must match again to the same result.
- **Cost:** about 0.1 KiB gzip in apps that route (routing-view and isomorphic budgets raised
  by that much, `scripts/size-budget.json`).

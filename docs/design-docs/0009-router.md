# ADR 0009 — Router: typed routes, navigation as commands, streaming `listen`

Status: **accepted** (2026-10-04). Bead: gyral-ud5.2. Builds on ADR 0003 and ADR 0006.

## Decision

### Route tables are pure and typed

```ts
const app = routes({ home: '/', user: '/users/:id' });
app.match('/users/7'); // { name: 'user', params: { id: '7' } } | undefined (typed by name)
app.href('user', { id: 'a b' }); // '/users/a%20b'
```

- Matching never touches `window`, so the same table serves SSR (gyral-4k7).
- Patterns are **literal segments and `:param` only**. `routes()` rejects URLPattern-only
  syntax (`*`, `?`, groups, regex) so both matchers behave identically. Trailing slashes are
  ignored; params are percent-decoded; first match in table order wins.
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

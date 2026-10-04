# ADR 0009 — Router: typed routes, navigation as commands, re-armed `listen`

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

### Incoming URL changes: a re-armed `listen` (no core change)

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

### Proposed core change (not made here): streaming drivers

Re-arming is explicit boilerplate. The smallest core change that removes it:

- `packages/core/src/command.ts`: `DriverContext` gains
  `readonly emit: (output: unknown) => void` (typed as `(output: O) => void` via
  `Driver<I, O, E>['run']`'s context), documented as "deliver an extra result; ignored after
  abort".
- `packages/core/src/internal/interpreter.ts` (`execute`): pass
  `emit: (o) => { const msg = cmd.onSuccess(o); if (msg !== undefined) dispatch(msg); }`
  into `driver.run`, guarded by the fiber still running (the existing `guardedDispatch`
  covers disconnect).

With it, `listen(toMsg)` becomes a single long-running command whose driver `emit`s each
location until aborted; the public `listen()` signature would stay, and `after` becomes
unnecessary. This would also serve `@gyral/time` (`periodic`) and WebSocket drivers. To be
decided with gyral-ud5.3.

## Consequences

- Routing works with neither URLPattern nor the Navigation API (tested by forcing both off).
- Components own their routing state: the route is model state derived from `RouteLocation`.
- SSR will call `app.match(requestUrl)` directly and seed the initial route.

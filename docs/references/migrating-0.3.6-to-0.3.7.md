# Behavior changes in 0.3.7

Gyral 0.3.7 is a patch release that fixes five bugs found in the apps that use Gyral (epic
gyral-k97). Three of the fixes change behavior that a working app can notice, so they come
first; each has a short fix. The rest add checks and warnings, or remove the need for a
workaround.

## Behavior changes

| Change                                                                                     | Before 0.3.7                                                                                                                              | What to do                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A client-rendered component's `init` commands start after its first render (gyral-k97.3)   | They started when the element connected: for an element already in the page, inside `define()`, before the entry's `provideDrivers()` ran | Nothing for most apps. A test that expected a driver to be called synchronously when an element was inserted awaits `settled()` first. A dynamic import that only existed to get `provideDrivers()` in first can become a static import again |
| A light-DOM component's first render replaces the children the page's HTML gave it (k97.4) | It kept them and appended its view after them                                                                                             | Children in the page's HTML are fallback content now. Move anything meant to stay into the component's view; a no-JavaScript message can move back inside the element from a `<noscript>` beside it                                           |
| Template rule 16 (new error): capitals in an attribute name on a custom element (k97.5)    | `<pool-card playerBase=${n}>` set `playerbase` without a word, and a prop `playerBase` reads `player-base`                                | Write the prop's attribute, `player-base=${n}` (or the lower-case name an `attribute:` override gives, `playerbase=${n}`), or bind the property, `.playerBase=${n}`. `vite build` and ESLint list every place                                 |

Details: view/05-element.md "When init's commands start" and ADR 0006's addendum (the first),
ADR 0014's addendum (the second), view/09-template-rules.md "Rule 16 since 0.3.7" (the third).
Server-rendered components are unchanged by the first two.

## New checks and warnings

- **Reserved prop names (G0023, a development error and a type error):** a prop named
  `state`, `send`, `drivers`, `stores`, `initialMessages` or a custom-element callback replaced
  the element's own member (a prop `state` hid the model). Rename the property and keep the
  attribute: `badge: prop.string({ attribute: 'state' })`. `define()`'s prop types now also
  reject built-in names such as `hidden` and `title`, which were already a development error.
- **Lowercased attributes (G0024, development):** a component warns at its first connect when
  page HTML or a host framework gives it a camelCase prop's lowercased name (`playerbase`).
- **Two copies of core (G0015):** `gyralVitePreset` warns once, in dev and builds, when
  `@gyral/core` is installed more than once, and development browsers warn when a page runs a
  second copy. Pin one version with your package manager's overrides.
- **A dialog or popover binding without its code (G0069, production):** `?modal` or
  `?popover-open` in a package the build didn't scan now warns instead of doing nothing.
- **G0043** names the boot order: provide drivers before importing components, or later in
  the same task with no `await` in between.

## Workarounds you can remove

- Removing the `gyral-compiled` resolve condition so installed component libraries keep their
  dialogs and invoker commands: the build's feature scan now reads compiled templates.
- Listing Gyral's own packages in `gyralVitePreset({ optimize })` or `optimizeDeps.include`:
  the preset pre-bundles every installed Gyral browser entry point. Keep other dependencies
  there.
- `attribute: 'playerbase'`-style overrides keep working, but are no longer needed to make a
  camelCase template attribute reach its prop: write the kebab-case attribute instead.

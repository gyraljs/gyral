# Publishing a component library

A package of Gyral components (a design system, a set of game widgets) shares the app's copy
of `@gyral/core`: a stylesheet from `css` or a store from another copy doesn't work in the
app's (consumer-setup.md "One copy of core"). Four rules keep it that way (ADR 0033).

## `@gyral/core` is a peer

```json
{
  "peerDependencies": { "@gyral/core": "^0.3.8" },
  "devDependencies": { "@gyral/core": "0.3.8" }
}
```

- **A peer, never a dependency.** A dependency pinned to one version installs a second core
  whenever the app has another one. A peer uses the app's.
- **A caret range** (`^0.3.8`: 0.3.8 up to, not including, 0.4.0). The lower bound is the
  oldest core you test against; raise it when you use something newer. Gyral's own packages
  pin core exactly because they use its internals; a library uses the public API, so any core
  in the range works.
- **The same for other Gyral packages** the library imports (`@gyral/http`, `@gyral/router`):
  peers with a caret range.
- **A dev dependency at the version you develop against**, for your own tests and builds.

## Public entry points only

Import from `@gyral/core`, `@gyral/core/storage` and the other documented entry points, never
from `@gyral/core/internal` or a file path: those change in any release. Import `html`, `svg`
and `css` from `@gyral/core` itself where you write templates; a re-export of them hides the
templates from the app's template compiler.

## Ship templates as written

Publish ES modules with their `html` templates as they are. The app's build compiles every
template it bundles, `node_modules` included, and its feature scan reads any installed package
that lists `@gyral/core`, a peer included: dialogs, invoker commands and the other features a
library uses stay in the app's bundle (consumer-setup.md "Template compiler").

## Test against the range

Run your tests with the lowest core your range allows and with the newest. A component library
is also a good place for `npx @gyral/mcp skill --check`, so the agents that work on it read
the skill for the Gyral version it supports.

# Using Gyral in an app

Gyral renders with its own view layer ([ADR 0018](../design-docs/0018-view-layer.md),
[view/](../design-docs/view/README.md)): templates, keyed lists, element hooks, styles, the
element base and the scheduler all live in `@gyral/core`. There is no `lit` dependency.

## Install

```sh
pnpm add @gyral/core
# Optional packages
pnpm add @gyral/http @gyral/router @gyral/time
pnpm add -D @gyral/testing
# Server rendering (ADR 0012; being rewritten for 0.3.0, see below)
pnpm add @gyral/ssr
```

| Package                                                         | Peer dependencies                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `@gyral/core`                                                   | none at runtime; `vite` and `parse5` (optional, build time) |
| `@gyral/http`, `@gyral/router`, `@gyral/time`, `@gyral/testing` | none beyond `@gyral/core`                                   |

Import everything a view needs from `@gyral/core`: `html`, `css`, `nothing`, `each`, `raw`,
`defineHook`, the hooks `invalid` and `labelledBy`, and `prop` for prop declarations.

## Vite and Vitest: `gyralVitePreset()`

Settings every Gyral app needs, shipped as a preset (safe in any config file):

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({ ...gyralVitePreset(), build: {/* … */} });

// vitest.config.ts: spread it into each browser project
projects: [{ ...gyralVitePreset(), test: { name: 'browser', browser: {/* … */} } }];
```

- **`plugins` (the template compiler)**: see below. If your config has plugins of its own,
  list both, or the spread is overwritten: `plugins: [...gyralVitePreset().plugins, mine()]`.
- **`optimizeDeps.include`**: empty by default. If Vite discovers a dependency during the
  first browser test run and reloads the page ("Vite unexpectedly reloaded a test"), list it:
  `gyralVitePreset({ optimize: ['some-dependency'] })`.

### Template compiler

The preset's plugin runs in `vite build` only (view/01-templates.md "Compiled"); the dev server
and Vitest keep the runtime template path. In a build it:

- rewrites every `html` template imported from `@gyral/core`, dependencies in `node_modules`
  included, into a precompiled template object, and adds the `gyral-compiled` resolve condition
  so the runtime template preparer leaves the bundle;
- fails the build, with a code frame, on a template rule violation (view/09-template-rules.md)
  and on any `html` it can't follow: an alias (`const h = html`), a call (`html(strings)`), or a
  re-export whose templates would stay uncompiled. Import `html` from `@gyral/core` where you
  write templates.
- checks rule 7 again with [parse5](https://github.com/inikulin/parse5) when it is installed
  (`pnpm add -D parse5`, an optional peer dependency; build time only). Without it, the build
  prints a one-time notice and keeps the normalizer's own check.

Options: `gyralVitePreset({ compiler: { parse5: false } })` skips the parse5 check;
`gyralTemplateCompiler()` is the plugin alone. The compiler needs Vite 8.

## Template whitespace

The view layer normalizes template whitespace once per template, the same way in the compiler,
the browser and the server (view/01-templates.md "Whitespace"), so there is nothing to
configure. Indentation between block-level tags disappears; between inline neighbours it
becomes one space; `<pre>`, `<textarea>`, `<script>`, `<style>` and `<title>` keep theirs.

## Tests

`await settled()` (from `@gyral/core`) waits until every component has rendered, view
transitions included (view/04-scheduler.md). It replaces 0.2's `el.updateComplete`.

## Server rendering

Server rendering and hydration are being rebuilt on the view layer for 0.3.0:
`@gyral/core/server` renders specs to strings without a DOM (view/06-server.md), and hydration
is built into core (view/07-hydration.md). Until then, a server-rendered component resumes its
state from its `data-gyral-seed`, clears the server's markup and renders fresh, and
`@gyral/ssr`'s rendering functions throw. Keep component state and props JSON-serializable:
they travel in the hydration seed.

## Removed in 0.3.0

`svg` templates, `classMap`, `styleMap`, `unsafeCSS`, `repeat`, `keyed`, `live`,
`liveBoolean`, `textarea()`, `directive`/`ElementDirective` and Lit re-exports are gone (ADR
0018). Use `each(items, key, row, pick?)` for keyed lists, plain bindings for form state
(`value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`), class and style strings,
`defineHook` for element behaviours, and plain interpolation in `css`. `svg` templates,
`classMap` and `styleMap` may return if a real need appears; inline `<svg>` inside `html`
works.

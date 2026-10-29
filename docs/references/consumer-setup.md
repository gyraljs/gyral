# Using Gyral in an app

Gyral renders with its own view layer ([ADR 0018](../design-docs/0018-view-layer.md),
[view/](../design-docs/view/README.md)): templates, keyed lists, element hooks, styles, the
element base, the scheduler, server rendering and hydration all live in `@gyral/core`, which
has no runtime dependencies. Upgrading from 0.2:
[migrating-0.2-to-0.3.md](migrating-0.2-to-0.3.md).

Production recipes: [strict CSP](strict-csp.md), [Node composition](node-production.md),
[lazy workspaces and offline assets](offline-assets.md), and [Rust rendering paths](rust-rendering.md).

## Install

```sh
pnpm add @gyral/core
# Optional packages
pnpm add @gyral/http @gyral/router @gyral/time
pnpm add -D @gyral/testing
# Server rendering: page shell, chunked responses, static generation (see "Server rendering" below)
pnpm add @gyral/ssr
```

| Package                                                     | Peer dependencies                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `@gyral/core`                                               | none at runtime; `vite` ^8, `parse5`, `eslint` 9 or 10 (optional) |
| `@gyral/http`, `@gyral/router`, `@gyral/time`, `@gyral/ssr` | none beyond `@gyral/core`                                         |
| `@gyral/testing`                                            | `vitest` ^4.1 or ^5 (optional, only for `@gyral/testing/vitest`)  |

Import everything a view needs from `@gyral/core`: `html`, `css`, `nothing`, `each`, `raw`,
`defineHook`, the `invalid` hook, and `prop` for prop declarations.

## Vite and Vitest: `gyral()`

Gyral's Vite plugins, for a Vite config and each Vitest project (safe in any config file):

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';

export default defineConfig({ plugins: [gyral()], build: { manifest: true } });
```

```ts
// vitest.config.ts: components run in a real browser (with projects, add it to each one)
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { gyral } from '@gyral/core/vite';

export default defineConfig({
  plugins: [gyral({ optimize: 'auto' })],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
```

- **`gyral()`** (0.3.8) returns the template compiler (below), `gyral:template-locations`,
  `gyral:dev-server` and `gyral:one-core`; list your own plugins beside it
  (`plugins: [gyral(), mine()]`). Its settings come through the plugins' `config` hooks, so
  nothing needs spreading. `gyralVitePreset()`, the 0.3.7 spelling, still works through 0.3.x:
  it returns `{ plugins: gyral(options), optimizeDeps }` to spread into a config.
- **`gyral:template-locations`** (dev server and Vitest only, 0.3.1): tells the development
  runtime where each `html` and `svg` template was written, so template rule errors and
  hydration mismatches name your file, line and column (view/01-templates.md "Source
  locations"). It rewrites each call site through an imported virtual location helper (`svg`
  the same way) and moves no authored line. Since 0.3.2, the helper's
  fallbacks live outside your sources, so application V8 coverage counts only your own branches.
- **`gyral:dev-server`** (dev server only): server-side rendering through Vite's dev server
  (`ssrLoadModule`) runs `@gyral/*`, and your direct dependencies that depend on them, through
  Vite instead of Node, so it renders development output and they all share one `@gyral/core`.
  It adds them to the server environments' `resolve.noExternal` in serve mode; builds keep
  them external (view/06-server.md "Development markers").
- **`gyral:one-core`** (0.3.7): keeps the app on one copy of `@gyral/core` (below, "One copy
  of core"). In the dev server and Vitest it pre-bundles the browser entry points of every
  Gyral package installed for the app (`@gyral/core` with `/compiled`, `/internal`, `/storage`
  and `/indexeddb`; `@gyral/http` with `/testing`, `/sse` and `/websocket`; `@gyral/router`,
  `@gyral/time`, `@gyral/devtools` and `@gyral/testing`), never the Node-only ones. Since
  0.3.8 it also pre-bundles your direct dependencies that use a Gyral browser package (a
  design system, a widget library), each browser entry point in their `exports`. Packages
  linked from source, such as a workspace's, stay unbundled, as Vite serves them. An entry
  your config lists in `optimizeDeps.exclude` is left out.
- **`optimize`**: pre-bundling beyond that. Vite pre-bundles what it finds at startup; a
  dependency it meets later makes it re-optimize and reload ("Vite unexpectedly reloaded a
  test" in Vitest). `optimize: 'auto'` (0.3.8) points Vite's startup scan at the modules that
  define components, and at a Vitest browser project's tests: Vite follows their imports, so
  everything they use is found up front. Server modules are never scanned. It is on by default
  when Vite runs as a custom server (`appType: 'custom'`, as `gyralDevServer` and
  `gyralDevMiddleware` do), where Vite has no HTML page to crawl; elsewhere set it yourself,
  as in a Vitest browser project. A config's own `optimizeDeps.entries` win;
  `optimize: false` turns the scan off; a list (`optimize: ['some-dependency']`) adds modules
  to pre-bundle, beside the default.
- **`clientOnly: true`** (0.3.1), for apps no server renders:
  `gyral({ clientOnly: true })` adds `gyral:client-only`, which leaves the hydration
  code out of the browser bundle (about 1 KiB gzip with Vite's preload helper; hello-world: 8.9
  → 7.9 KiB) and keeps the invoker-command fallback only when a module may use `command`
  intents (`data-intent-on="command"`, a bound `data-intent-on`, `events: ['command']`, or
  Gyral's `raw()`). Only your own source and installed packages that depend on a `@gyral/*`
  package (directly or through their dependencies) are scanned, comments excluded; other
  dependencies never keep it. Server-rendered markup met anyway renders fresh, replacing the
  server's (development warns). Leave it off for apps with `@gyral/ssr`, and give Vitest the
  same `gyral({ clientOnly: true })` so tests match the build (view/07-hydration.md "Client-only builds").

### One copy of core

An app and the libraries it installs must share one copy of `@gyral/core`. A value one copy
makes doesn't work in another: a stylesheet from `css` is branded by its copy, and a store
lives in its copy's registry. The failure shows up far from the cause, for example as
`styles.flatMap is not a function` when one copy's component gets the other copy's
stylesheet. A second copy has two sources, and the preset covers both (0.3.7):

- **Dev server and Vitest.** Vite pre-bundles dependencies. One it meets partway through a run
  is bundled again with a copy of core of its own, and Vitest reports a reload. The preset
  pre-bundles Gyral's packages up front (above).
- **The install.** Gyral's own packages take core as a peer at their exact version (0.3.8,
  ADR 0033), so they never install a copy of their own: give every `@gyral/*` package the same
  version. Another version is reported at install time (pnpm lists the unmet peer, npm stops
  with ERESOLVE), and the package throws G0016 when it loads in development. A library pinned
  to another version of core, or pnpm resolving different peers for one, can still install a
  second folder. When `@gyral/core` resolves to more than one folder from the app and its
  dependencies, the preset warns once at startup, in dev and in builds, with each copy's
  version, folder and the packages that use it (G0015). Pin one version with your package
  manager (`pnpm.overrides` or pnpm-workspace.yaml `overrides`, npm `overrides`, Yarn
  `resolutions`) and reinstall. A library lists `@gyral/core` as a peer, so it shares the
  app's copy ([component-libraries.md](component-libraries.md)).

Development builds also warn in the browser when a page runs a second copy (G0015, with both
versions and the URLs they loaded from). Production builds don't check at run time, because
separately bundled widgets may each carry their own copy on purpose.

### Coverage

Keep `gyral()` in the tested project and include your application source explicitly
in Vitest coverage, for example `coverage: { provider: 'v8', include: ['src/**/*.ts'] }`.
Install `@vitest/coverage-v8` at the same version as Vitest. The development locator preserves
source maps and authored branch counts; you do not need to remove diagnostics or lower a
coverage threshold. This correction ships since 0.3.2: on 0.3.1 the locator's fallbacks still
count as branches, so keep an existing workaround until you upgrade. The regression uses Vitest 5.0.3 and an aliased template tag.
Istanbul instrumentation is not covered by that comparison.

### Element typings

The preset writes `.gyral/elements.d.ts`, `HTMLElementTagNameMap` entries for every exported
`define()` component under `src` (option `types: { dirs, out }`, or `types: false`); calls in
comments and strings are skipped. Gitignore `.gyral/`, add `".gyral/elements.d.ts"` to tsconfig
`include`, and run `gyral-types` (a bin of `@gyral/core`) before a `tsc` that runs without Vite: `"typecheck": "gyral-types && tsc --noEmit"`
(skills/gyral/references/components.md "Typing the tag").

### Template compiler

The preset's plugin runs in `vite build` only (view/01-templates.md "Compiled"); the dev server
and Vitest keep the runtime template path. In a build it:

- rewrites every `html` (and `svg`) template imported from `@gyral/core`, dependencies in
  `node_modules` included, into a precompiled template object, and adds the `gyral-compiled`
  resolve condition so the runtime template preparer leaves the bundle;
- fails the build, with a code frame, on a template rule violation (view/09-template-rules.md)
  and on any `html` it can't follow: an alias (`const h = html`), a call (`html(strings)`), or a
  re-export whose templates would stay uncompiled. Import `html` from `@gyral/core` where you
  write templates.
- bundles view transitions, the frame lane and custom states only when a module names
  `viewTransition`, `renderOnFrame` or `states` in code (0.3.1; comments don't count). It
  reads your own source and installed packages that depend on a `@gyral/*` package, directly
  or through their dependencies; a library that writes spec fields for your components must
  list `@gyral/core` (a peer dependency is enough), or the feature degrades as on a browser
  without it (view/05-element.md "Features register themselves").
- checks rule 7 again with [parse5](https://github.com/inikulin/parse5) when it is installed
  (`pnpm add -D parse5`, an optional peer dependency; build time only). Without it, the build
  prints a one-time notice and keeps the normalizer's own check.

Options: `gyral({ compiler: { parse5: false } })` skips the parse5 check;
`compiler: { sources: ['@gyral/core', 'my-design-system'] }` also compiles templates whose
`html` comes from a package that re-exports it (that package must also export `compiled`, and
`compiledSvg` if it re-exports `svg`).
The preset is the only Vite API: compiler and client-only behaviour are its options. The compiler needs Vite 8.

## ESLint: `@gyral/core/eslint`

The template rules (view/09-template-rules.md) in the editor, with the compiler's messages, and
pure `each` rows (view/03-lists.md). It works without Vite. ESLint 9 or 10 with a flat config:

```sh
pnpm add -D eslint
```

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

export default [
  // …your other configs (typescript-eslint, …)
  { files: ['src/**/*.ts'], ...gyral.configs.recommended },
];
```

`recommended` turns on `gyral/template` (every `html` template imported from `@gyral/core`)
and `gyral/each-row-purity` (`each` rows read only their arguments; keys required), both as
errors, and `gyral/unused-intent` (an intent parser no template in the module names; 0.3.1) as
a warning. If your templates come from a package that re-exports `html` (a design system), give
the rules the same `sources` list as the Vite preset:

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

const sources = ['@gyral/core', 'my-design-system'];

export default [
  {
    files: ['src/**/*.ts'],
    ...gyral.configs.recommended,
    rules: {
      'gyral/template': ['error', { sources }],
      'gyral/each-row-purity': ['error', { sources }],
      'gyral/unused-intent': ['warn', { sources }],
    },
  },
];
```

The editor checks what the normalizer can see from the template's strings. `vite build` still
runs the parse5 check (rule 7) and is the authority; the development runtime still catches rows
ESLint can't follow and page shells rendered in the browser (rule 11).

## Template whitespace

The view layer normalizes template whitespace once per template, the same way in the compiler,
the browser and the server (view/01-templates.md "Whitespace"), so there is nothing to
configure. Indentation between block-level tags disappears (head-only tags such as `<meta>`
and `<link>` count, and nothing survives inside `<head>`); between inline neighbours it
becomes one space; `<pre>`, `<textarea>`, `<script>`, `<style>` and `<title>` keep theirs.

## Tests

Test the model without a DOM (`step`, `run` and `initial` from `@gyral/testing`) and elements in
a real browser with Vitest browser mode (the `vitest.config.ts` above), never jsdom. Swap
drivers for fakes (`fakeDriver`, `fakeHttp` from `@gyral/http/testing`, core's `provideDrivers`).
`await settled()` (from `@gyral/core`) waits until every component has rendered, view
transitions included, and messages have stopped arriving (view/04-scheduler.md "`settled()`"):
a stream or store notification already on its way in a microtask is waited for, while commands
that never end (a store watch, a socket) don't block it. It never waits for timers or the
network: answer fakes or advance `virtualTime` first. It replaces 0.2's `el.updateComplete`.

**Hydration tests** mount real server markup in the browser (`mountSsr(html)` from
`@gyral/testing`), import the component modules, then `await hydrated(page)`, which fails on a
mismatch, on console errors or warnings and on elements that never upgraded. A browser test
can't render that markup itself, so it comes from Node:

- **`renderOnServer`** from `@gyral/testing/vitest` (needs `vitest` 5), a Vitest browser
  command: add `commands: { renderOnServer }` to `test.browser` above, then in a test call
  `commands.renderOnServer({ module: '../src/counter.ts', export: 'Counter', props })`
  (`commands` from `vitest/browser`) and pass the HTML to `mountSsr`. It renders in Vitest's Node
  process through the project's Vite server and Gyral's server renderer. Best for components and
  pages one module can render, with props per test and no files to keep in sync.
- **A golden fixture:** a Node test calls your real server and writes the HTML with
  `toMatchFileSnapshot('./fixtures/page.ssr.html')`; the browser test imports it with `?raw`.
  Best when the markup needs the whole server stack (routing, data loading, a built server),
  when markup changes should show up in review, or outside Vitest browser mode.

Details and a full example: the `@gyral/testing` README. Run hydration tests against
production builds of core too (a second browser project with
`resolve: { conditions: ['module', 'browser', 'production'] }`): a mismatch there warns and
re-renders instead of throwing.

## Server rendering

`@gyral/ssr` renders template results and components to HTML without a DOM
(view/06-server.md): synchronous, chunked at component boundaries, runtime-agnostic (no
Node-only APIs). Chunked is not async streaming: data is loaded before the render starts, and
`renderPage`'s body is that render pulled one component boundary at a time. It is server-only: never import it from client code, so client bundles
carry no server renderer. Its API: `renderPage` (a chunked `Response`; `renderPage({ csp })`)
and `renderToString` (both with per-request `stores`), `contentSecurityPolicy()` and
`styleHashes()` (style hashes for a strict `style-src`), `formAction` and `@gyral/ssr/static`.
The renderer itself lives in core's internal server entry, which only Gyral's packages
import.

- Register components on the server by importing their modules: `define()` records the spec
  outside the browser, and the renderer renders it in place of its tag.
- Development output (the `development` export condition: Vite's dev server with the preset,
  Vitest) carries `<!--gyral:ID-->` markers and runs development checks; plain `node`/`tsx` and
  servers built with `vite build` get production output. Pass `{ dev: true | false }` to
  override.
- SSR builds keep the server segments of compiled templates (the Vite preset does this for
  `build.ssr`); a template compiled for the client can't be server-rendered.
- **CSP:** `renderPage({ csp: { directives } })` allows every shadow component's `<style>` by
  hash, so `style-src` needs no `'unsafe-inline'`. `style` attributes are different. The
  client writes them through the CSSOM, which `style-src` doesn't restrict, so client renders
  and updates always apply. The server writes them into the HTML, where a strict `style-src`
  blocks them until the element hydrates (hydration writes them again through the CSSOM).
  For the first paint, select stylesheet rules with classes or data attributes, use inline
  styles only for custom properties with a fallback in the stylesheet, or let `renderPage`
  hash the values the page wrote: `csp: { directives, styleAttributes: 'hash' }` adds
  `style-src-attr 'unsafe-hashes' 'sha256-…'` per distinct value (the page is rendered to a
  string first; at most `maxStyleHashes`, default 128). Details:
  [view/08-styles.md](../design-docs/view/08-styles.md) "Style attributes under a strict CSP".
- **Trusted Types:** the browser parses template HTML and `raw()` markup through one policy
  named `gyral`, so `require-trusted-types-for 'script'` works in client-only and
  server-rendered apps alike. If the policy also names the allowed policies, add `gyral`:
  `require-trusted-types-for 'script'; trusted-types gyral`. Details:
  [view/01-templates.md](../design-docs/view/01-templates.md) "Instantiation".

Hydration is built into core (view/07-hydration.md): a server-rendered component resumes its
state from its `data-gyral-seed` and adopts the server's DOM in place; there is no hydration
import, and module order doesn't matter. Keep the state and props of server-rendered
components (and seeded store state) JSON-serializable: they travel in the hydration seed.
Client-only components have no seed, so their state may hold other values. A mismatch between server markup and the first client
render throws `HydrationMismatch` in development; production builds warn and re-render only
that component. Hydration code (about 2.8 KiB gzip) is a separate chunk loaded with the first
server-rendered component, so client-only pages never fetch it. For server-rendered pages,
read the entry and its preloads from the Vite manifest with `clientAssetsFromManifest()`
(`@gyral/ssr/static`) and pass them as `renderPage({ scripts, modulepreload })`: the browser
then fetches the hydration chunk together with the entry (`productionServer` hands
`modulepreload` to your `createApp`, and `assets(modules)` for pages that import a route's
module lazily). CSS imported from the client entry (`import './app.css'`) is hashed by Vite and
listed as `css`: pass it as `renderPage({ stylesheets })` to link it (immutable, cached across
pages, allowed by `style-src 'self'`) instead of inlining it with `styles` on every page.

**Automatic component loading** replaces the client entry for most apps:
`gyral({ components: true })` gives every component defined under `src/` its own
module behind a small loader, and `renderPage({ components })` links exactly the components a
page rendered (their modules, preloaded, and the loader) after the body; a page that rendered
none loads no JavaScript. `gyralDevServer` and `productionServer` hand `components` to your app,
and `componentsFromManifest(join(dist, 'client'))` reads it for a prerender step. Keep a small
entry, passed in `scripts`, only for app-wide setup such as `provideDrivers`; the tail after
the body never repeats a module, stylesheet or script the head already links. Details:
[ADR 0016](../design-docs/0016-production-builds.md) "Automatic component loading".

### Development server

`gyralDevServer({ entry: '/server/app.ts', app })` (`@gyral/ssr/node`) is the development
server: Vite serves client modules and HMR, and every other request goes to your server
module, loaded through Vite, and streams its response. Since 0.3.8 `app` builds the handler
once per module version (Vite loads a new one after an edit) and component set, not per
request, so keep per-request work inside the handler; `state` keeps in-memory data across
reloads, and a render error shows Vite's error overlay. `gyralDevMiddleware` (0.3.8) is the
same as a Connect-style handler for a server of your own: Express and Connect take
`dev.middleware` with `app.use()`, Fastify through `@fastify/middie`. It answers every request
that reaches it, so mount your own routes first. See the SSR skill's "Development server".

### Request layer

Gyral doesn't route requests or run middleware: use a fetch router such as Hono for routing,
middleware, cookies and error pages, and plug `renderPage`, `formAction` and
`productionServer` into it ([ADR 0026](../design-docs/0026-request-layer.md)). The seams:
`formAction` without `invalid` for endpoints only `submitForm` calls, `wantsJson(request)` for
routes that answer both ways, and `productionServer({ onResponse })` for headers and cookies on
every response.

### Serving a production build on Node

`productionServer({ distDir, createApp })` (`@gyral/ssr/static`) serves the Vite client build
(`/assets/*`, immutable), prerendered pages and everything else through your `createApp`;
`toNodeListener` (`@gyral/ssr/node`) mounts it on `node:http`, writing each page's chunks with
backpressure. Options: `assetsDir` (another directory for `/assets/*`, for example a volume
that keeps older releases' files), `staticDir: false` when nothing is prerendered, `cache`.

```ts
import { createServer } from 'node:http';
import { join } from 'node:path';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { toNodeListener } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';

const app = await productionServer({
  distDir: join(process.cwd(), 'dist'),
  staticDir: false, // nothing prerendered: every page renders per request
  // With gyral({ components: true }): each page loads the components it rendered.
  // With a client entry instead: scripts: [clientEntry], plus modulepreload and stylesheets.
  createApp: ({ components, stylesheets }) => ({
    fetch: (_request: Request) =>
      renderPage({
        title: 'Home',
        body: html`<my-home></my-home>`,
        stylesheets,
        ...(components === undefined ? {} : { components }),
      }),
  }),
});

// origin: the public origin request URLs are built on (default: the Host header).
createServer(toNodeListener(app.fetch, { origin: 'https://example.com' })).listen(3000);
```

## Removed in 0.3.0

`classMap`, `styleMap`, `unsafeCSS`, `repeat`, `keyed`, `live`,
`liveBoolean`, `textarea()`, `directive`/`ElementDirective` and 0.2's Lit re-exports are gone
(ADR 0018; every change, with before/after code, in
[migrating-0.2-to-0.3.md](migrating-0.2-to-0.3.md)). Use `each(items, key, row, pick?)` for
keyed lists, plain bindings for form state (`value=${v}`, `?checked=${v}`,
`<textarea>${v}</textarea>`; written only when the model's value changes, so other renders keep
the user's edits), class and style strings, `defineHook` for element behaviours, and plain
interpolation in `css`. Inline `<svg>` inside `html` works; `svg` templates (SVG fragments
rendered inside an `<svg>`) came back in 0.3.1 (view/01-templates.md "svg templates").

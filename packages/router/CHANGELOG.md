# @gyral/router

## 0.3.7

### Patch Changes

- Updated dependencies [295c705]
- Updated dependencies [2c1f071]
- Updated dependencies [16ef016]
- Updated dependencies [3d21a73]
- Updated dependencies [1454ffe]
  - @gyral/core@0.3.7

## 0.3.6

### Patch Changes

- 893c4e7: Docs and agent guidance aligned with the code:

  - `listen`'s doc comment (and so `get_api("listen")` and the API reference) starts it from `subscriptions`, not `init`, matching the guides and `check_snippet`.
  - `scaffold_component`'s `ssr-page` route imports the component from `../src/`, where it is written; a test now resolves every relative import in every scaffold.
  - Development error messages no longer cite internal design documents; the hydration-mismatch message links to gyral.dev. The error groups on the errors page are named "Error handling", "Subscriptions" and "Element calls".
  - `retry`'s doc comment names `provideDrivers` and `el.drivers` (the spec `drivers` field was removed in 0.3.1); `@gyral/testing`'s description drops the removed schema arbitraries; the `clientOnly` comment drops a removed API.
  - create-gyral's `AGENTS.md` adds the MCP server, `llms-small.txt`, the `subscriptions` rule and the real `typecheck` script.

- Updated dependencies [893c4e7]
- Updated dependencies [820577b]
  - @gyral/core@0.3.6

## 0.3.5

### Patch Changes

- Updated dependencies [be8f8d1]
  - @gyral/core@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [340eae6]
  - @gyral/core@0.3.4

## 0.3.3

### Patch Changes

- Update the `@gyral/core` dependency to 0.3.3.

## 0.3.2

### Patch Changes

- Update the `@gyral/core` dependency to 0.3.2.

## 0.3.1

### Patch Changes

- Support optional named segments (`:id?`) and trailing catch-all captures (`:path*`,
  readonly arrays), including zero-segment captures. Native URLPattern, fallback and server
  matching agree; encoded slashes remain within their original segments.
- `href` encodes each capture and rejects ambiguous optional omissions, invalid shapes,
  empty/dot segments and missing required values. First match wins; applications explicitly
  set HTTP 404 for their final not-found route.
- Matches include the canonical path. Navigation handles scroll restoration, fragments and
  focus consistently across Navigation API and the lazy History API fallback.
- Share typed head data with server rendering through `setHead`. Traverse history through
  router commands; standalone back/forward/go helpers are removed.
- Update the `@gyral/core` dependency to 0.3.1; see the [migration guide](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.3.0-to-0.3.1.md).

## 0.3.0

### Minor Changes

- 2da293e: Released with Gyral 0.3's own view layer (ADR 0018). No API changes in this package; upgrade
  every `@gyral/*` package to 0.3 together, and an app installs no Lit packages:
  [docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

### Patch Changes

- Updated dependencies [fe849f8]
- Updated dependencies [595e1c4]
- Updated dependencies [49ff2ad]
- Updated dependencies [9c6c8bd]
- Updated dependencies [ca68fe8]
- Updated dependencies [784bd2f]
- Updated dependencies [8803ef3]
- Updated dependencies [6971fbe]
- Updated dependencies [b2ae8e5]
- Updated dependencies [d3f540a]
  - @gyral/core@0.3.0

## 0.2.0

### Minor Changes

- 74054b3: Smaller and faster, with no public API change:

  - **No Effect.** The command interpreter is now plain TypeScript with no runtime dependencies,
    so `@gyral/core` depends only on Lit. An empty app drops from about 49 KiB to about 11 KiB
    gzipped, starts faster and uses less memory; rendering speed is unchanged (ADR 0015).
  - **Template whitespace minification.** `html` and `svg` remove indentation whitespace between
    tags (once per template, on server and client alike), so lists build far fewer DOM nodes and
    bulk list updates are 9–22% faster. Inline spacing is kept as one space; `<pre>`,
    `<textarea>`, `<script>`, `<style>`, attributes and comments are unchanged. For exact
    whitespace under CSS `white-space: pre*`, use `html` from `lit`.
  - **lit-html leak guidance.** lit-html 3.3.1 and later leak a comment node per removed
    `repeat()` item (lit/lit#5298). Development builds warn once when an affected version is
    loaded; pin lit-html to 3.3.0 with an override until it is fixed upstream
    (docs/references/consumer-setup.md). New `create-gyral` apps are pinned.

### Patch Changes

- a7275e8: Copyright and package author are Mike Zupper.
- Updated dependencies [a7275e8]
- Updated dependencies [fa0156a]
- Updated dependencies [74054b3]
  - @gyral/core@0.2.0

## 0.1.0

### Minor Changes

- 8b5f5ca: First public release.

### Patch Changes

- Updated dependencies [8b5f5ca]
  - @gyral/core@0.1.0

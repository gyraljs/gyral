# @gyral/mcp

## 0.3.2

### Patch Changes

- Add the `gyral-mcp-http` binary: a read-only, anonymous Streamable HTTP server with request
  size and rate bounds, for hosting the docs and API tools publicly. It leaves out
  `check_snippet`, which stays in the local stdio binary, `gyral-mcp`.
- Add a `start_here` tool that returns the mental model, rules, workflow and an index of use
  cases. Every tool description now carries the workflow too, so clients that drop server
  instructions still get it.
- `scaffold_component` reads the project's `package.json` (or an `installed` list) and imports
  only packages that are installed. It adds a dependency-free `form-native` kind and writes a
  model test only when `@gyral/testing` and `vitest` are installed.
- `check_snippet` suggests fixes for recognized TypeScript errors and common Gyral mistakes.
- `get_doc` accepts a `path`, and `get_api` suggests the nearest exports for a name it does not
  know and explains unexported helper types.
- Refresh the bundled documentation from gyral.dev, including the Recipes page, native-first
  forms and the lifecycle, workload, Node, PWA and Rust guidance.

## 0.3.1

### Patch Changes

- Refresh the bundled documentation for the final 0.3.1 API, including forms, routing,
  storage, native network streams, modal timing, security, accessibility and migration.
- Include `@gyral/core/storage`, `@gyral/core/indexeddb`, `@gyral/http/sse` and
  `@gyral/http/websocket` in API lookup, with their factories and public types.
- Align scaffolding and snippet checking with two-call `define`, current driver/subscription
  patterns and the simplified public surface. Remove obsolete class-field configuration.
- Keep server/corpus APIs public and tool implementation helpers internal.

## 0.3.0

### Minor Changes

- 27e83ae: The corpus teaches Gyral 0.3: API entries from `@gyral/core/server` and `@gyral/core/eslint`
  (and no longer the empty `@gyral/ssr/hydrate`), examples and the agent skill on the new view
  layer, and `ssr-page` scaffold notes for built-in hydration and `modulepreload`. No Lit
  packages in its dependency tree.
  The docs snapshot comes from gyral.dev's 0.3 docs, and `search_docs` ranks a section named after
  the query (`Lazy hydration` for "lazy hydration") above pages that only mention it.

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

- ba8b229: New package: `@gyral/mcp`, an MCP server for coding agents (`npx -y @gyral/mcp`). Tools:
  `search_docs`, `get_doc`, `get_api`, `list_examples`, `get_example`, `scaffold_component` and
  `check_snippet`; resources for llms.txt and the Gyral skill; a `build-gyral-component` prompt.
  A patch changeset on purpose: the packages release in lockstep, so a minor here would move
  every package to 0.2.0.

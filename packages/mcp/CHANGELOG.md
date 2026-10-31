# @gyral/mcp

## 0.3.10

### Patch Changes

- ae54fba: `search_docs` matches query words only at the start of a word (gyral-99t). "rust" no longer
  matches inside "trusted", so the Rust servers guide comes first for it instead of Trusted Types.
  Prefixes still match ("hydrat" finds "hydration"), and so do the words of a camelCase name
  ("changed" finds `PropsChanged`, "action" finds `formAction`).

## 0.3.9

### Patch Changes

- 928fd67: The docs and the bundled skill no longer overstate render skipping (gyral-4rp). It helps only
  when `update` returns the same state: a message that carries a new object each time (a game's
  HUD snapshot, a sensor reading) still renders. Keep a compare that stops a high-rate source from
  sending messages, in the driver or as the subscription's `equals` and `select`; the 0.3.8 notes
  had listed one such compare as a workaround to remove.
- 640a85a: `gyral-mcp skill --dir <folder>` writes an absolute folder where it points (gyral-vbm). Before,
  `--dir ~/.claude/skills/gyral` was joined onto the app's folder, so a user-level copy landed in a
  nested folder inside the project instead. Folders inside the app print relative to it; others
  print in full.
- 93859c4: `gyral-mcp skill` keeps the files an owner puts beside a vendored or user-level copy of the skill
  (gyral-337.18). Before, it removed them, and `--check` failed on them. Kept and never compared, at
  the top of each folder: `LICENSE` (or `LICENCE`), `NOTICE`, `COPYING`, `PINNED` and `SOURCE` (or
  `SOURCES`), each with any extension or suffix (`NOTICE.txt`, `PINNED.txt`, `SOURCE-gyral.md`).
  Any other file the skill doesn't ship is still removed.

  Each copy also gets a `VERSION` file naming its release and the source it came from
  (`https://github.com/gyraljs/gyral/tree/v<version>/skills/gyral`), which `--check` compares like
  the skill's other files, so a pin note is no longer needed. The first `skill` run after
  upgrading writes it, and `--check` fails until then.

## 0.3.8

### Patch Changes

- afa277c: `gyral-mcp skill` (gyral-337.4): `npx @gyral/mcp@<version> skill`, in an app with that
  `@gyral/core` version installed, writes the Gyral skill it bundles to `.claude/skills/gyral`,
  and to `.agents/skills/gyral` when that folder exists (`--dir` names others), removing files the
  skill no longer has. `--check` writes nothing and exits 1 when a copy differs, for CI. It
  replaces hand-copied skills pinned by hash.
- cb0a568: Depend on zod 4.6.7, which fixes GHSA-mrhx-c7xc-m3w5: validating an oversized constrained
  collection could exhaust memory (gyral-337.8). The server's tool schemas have no collections and
  it caps request bodies at 16 KiB, so it wasn't reachable, but security scanners flagged the
  exact 4.6.5 pin.

## 0.3.7

### Patch Changes

- 92c6cfd: The bundled docs include the new Rust servers guide (`get_doc "rust-servers"`): build-time pages with a Rust API, Askama pages with browser-rendered components, and embedded rendering with `gyral-rs`. `start_here` lists it as a use case, and the skill's Rust section points to it.
- 50052ca: The bundled docs snapshot matches gyral.dev for 0.3.7: the guides describe this release (`init`'s commands start after the first render, a light-DOM component's page children are fallback content, template rule 16 and reserved prop names, the preset pre-bundles Gyral's packages), the errors page explains G0015, G0024 and G0069, the API reference pages carry 0.3.7's doc comments, and repository links point at the `v0.3.7` tag.

## 0.3.6

### Patch Changes

- 893c4e7: Docs and agent guidance aligned with the code:

  - `listen`'s doc comment (and so `get_api("listen")` and the API reference) starts it from `subscriptions`, not `init`, matching the guides and `check_snippet`.
  - `scaffold_component`'s `ssr-page` route imports the component from `../src/`, where it is written; a test now resolves every relative import in every scaffold.
  - Development error messages no longer cite internal design documents; the hydration-mismatch message links to gyral.dev. The error groups on the errors page are named "Error handling", "Subscriptions" and "Element calls".
  - `retry`'s doc comment names `provideDrivers` and `el.drivers` (the spec `drivers` field was removed in 0.3.1); `@gyral/testing`'s description drops the removed schema arbitraries; the `clientOnly` comment drops a removed API.
  - create-gyral's `AGENTS.md` adds the MCP server, `llms-small.txt`, the `subscriptions` rule and the real `typecheck` script.

- 79aa5e1: The stdio server's nudge now counts every read since the last `scaffold_component` or
  `check_snippet`, not only `get_api` calls: `start_here`, `search_docs`, `get_doc`, `get_api`,
  `list_examples`, `get_example` and resource reads. In 0.3.4, `get_example` reset the count, so
  an agent could read ten examples in a row and never be told to write. From the third
  `get_example`, the fourth `get_api` or the eighth read of any kind, tool answers end with a
  nudge to adapt the closest example already read (by name) and run `check_snippet`, or, with no
  example read, the next call for the task. The stateless HTTP server still never nudges.
- 24a1b29: `check_snippet` no longer crashes with `ts.convertCompilerOptionsFromJson is not a function` in
  a project with TypeScript 7, which exposes no compiler API: it says it needs TypeScript 5 or 6
  and to run the project's own typecheck instead. The optional `typescript` peer is now
  `>=5.0 <7`.

## 0.3.5

### Patch Changes

- The docs snapshot (`get_doc`, `search_docs`) and the bundled skill describe 0.3.5. The API
  reference entries now say to start from Recipes or Forms and that most types are inferred;
  the Forms example names its focus command before returning `[state, commands]`; the agent
  pack and the skill say to render a component by its defined tag (`<signup-form>`), never a
  JSX-style `<SignupForm>`, which `@gyral/core` 0.3.5 reports as template rule 15. Tools and
  input schemas are unchanged.

## 0.3.4

### Patch Changes

- 27e801e: Steer agents from browsing types to working code. `get_api` on a function with a matching
  example (`define`, `html`, `each`, `intentsOf`, `fieldErrors`, `invalid`, `focus`, `form`,
  `every`, `command`, …) appends a short typechecked usage module and the next call, such as
  `scaffold_component({ tag: "signup-form", kind: "form-native" })`; on a type it adds a one-line
  note that TypeScript infers it and that `check_snippet` names the real type errors. From the
  fourth `get_api` call since the last `get_example`, `scaffold_component` or `check_snippet` in a
  stdio session, answers end with a nudge naming the next call for the task (the stateless HTTP
  server keeps no such state). `get_api("*")` groups the functions by task, with the example or
  scaffold to start from, and collapses the types. The server instructions and tool descriptions
  lead with the workflow, and the bundled skill's forms reference leads with native validation.

## 0.3.3

### Patch Changes

- Fix `npx -y @gyral/mcp`, the documented way to run the server, which 0.3.2 broke: it failed
  with "npm error could not determine executable to run", because 0.3.2 added a second bin,
  `gyral-mcp-http`, and npx only picks a bin when there is one (or one named `mcp`). The
  package has one bin again, `gyral-mcp`. With no arguments it is the stdio server, as before;
  `gyral-mcp http` replaces `gyral-mcp-http`, with the same environment variables.
  `gyral-mcp --help` describes both modes, and an unknown command or option is an error
  instead of silently starting stdio. On 0.3.2, `npx -y -p @gyral/mcp@0.3.2 gyral-mcp` works.

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

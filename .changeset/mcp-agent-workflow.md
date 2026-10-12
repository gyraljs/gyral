---
'@gyral/core': patch
'@gyral/mcp': patch
'@gyral/ssr': patch
'@gyral/testing': patch
---

Make the MCP workflow survive clients that drop server instructions: every tool description
carries it, and a new `start_here` tool returns the mental model, rules, workflow and a use-case
index. `scaffold_component` reads the project's `package.json` (or an `installed` list) and
imports only installed packages, adds a dependency-free `form-native` kind, and writes a model
test only when `@gyral/testing` and `vitest` are installed. `check_snippet` returns suggested
fixes for recognized TypeScript errors and common Gyral mistakes. `get_doc` accepts `path`, and
`get_api` suggests the nearest exports and explains unexported helper types. `@gyral/core` adds
the type-only exports `Reducer`, `Variant`, `ParseResult` and `StandardSchemaV1`, and public doc
comments no longer cite repository paths.

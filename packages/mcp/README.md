# @gyral/mcp

An [MCP](https://modelcontextprotocol.io) server that teaches coding agents
[Gyral](https://gyral.dev): search the docs, look up exact API signatures, read working
examples, scaffold components the Gyral way, and typecheck code before presenting it.

It answers from a corpus bundled at build time (the gyral.dev docs, the public API of every
`@gyral/*` entry point, the examples and the Gyral agent skill), so it works offline and
matches its own Gyral version.

## Install

**Claude Code**

```sh
claude mcp add gyral -- npx -y @gyral/mcp
```

**Cursor** (`.cursor/mcp.json`)

```json
{ "mcpServers": { "gyral": { "command": "npx", "args": ["-y", "@gyral/mcp"] } } }
```

**VS Code** (`.vscode/mcp.json`)

```json
{ "servers": { "gyral": { "type": "stdio", "command": "npx", "args": ["-y", "@gyral/mcp"] } } }
```

**Codex**

```sh
codex mcp add gyral -- npx -y @gyral/mcp
```

Any other client: run `npx -y @gyral/mcp` as a stdio server, from your project directory.

## Tools

| Tool                 | What it returns                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `search_docs`        | Ranked doc sections (title, URL, snippet) for a query                                          |
| `get_doc`            | One docs page, or one section with `#anchor` (`forms#the-server-half`)                         |
| `get_api`            | Declaration, doc comment and import line of a public export; `"*"` lists them all              |
| `list_examples`      | Every example and what it demonstrates                                                         |
| `get_example`        | One example's component source                                                                 |
| `scaffold_component` | Starting code: `basic`, `form` (works without JavaScript) or `ssr-page`                        |
| `check_snippet`      | Type errors for a TypeScript module, against your project's TypeScript and `@gyral/*` versions |

Resources: `gyral://llms.txt`, `gyral://skill` and `gyral://skill/references/{name}`.
Prompt: `build-gyral-component` (plan, scaffold, test and typecheck a component).

## Configuration

| Variable            | Default               | Effect                                                                                                                    |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GYRAL_PROJECT_DIR` | the working directory | Where `check_snippet` finds `typescript` and `@gyral/*`                                                                   |
| `GYRAL_DOCS_URL`    | unset (bundled docs)  | Load a newer `llms-full.txt` at startup, e.g. `https://gyral.dev/llms-full.txt`; falls back to the bundled copy after 3 s |

`check_snippet` uses the TypeScript installed in your project (an optional peer dependency),
so `npx` doesn't download a second compiler.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

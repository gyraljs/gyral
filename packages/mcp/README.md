# @gyral/mcp

An [MCP](https://modelcontextprotocol.io) server that teaches coding agents
[Gyral](https://gyral.dev): search the docs, look up exact API signatures, read working
examples, scaffold components the Gyral way, and typecheck code before presenting it.

It answers from a corpus bundled at build time (the gyral.dev docs, the public API of the
`@gyral/*` packages, the examples and the Gyral agent skill), so it works offline and
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

**Hosted, no install**: a public server is live at `https://mcp.gyral.dev/mcp`. Configure your
client for Streamable HTTP with that URL; no token is needed. For example
`claude mcp add --transport http gyral https://mcp.gyral.dev/mcp`, or in `.vscode/mcp.json`
`{ "servers": { "gyral": { "type": "http", "url": "https://mcp.gyral.dev/mcp" } } }`. It has
every tool except `check_snippet`, which needs your project, so prefer the local stdio server
when your agent writes code. See [Public hosting](#public-hosting).

## Tools

| Tool                 | What it returns                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `start_here`         | Orientation: the mental model, rules, workflow, which tool to use when, and a use case → example/guide index         |
| `search_docs`        | Ranked doc sections (title, URL, snippet) for a query                                                                |
| `get_doc`            | One docs page, or one section with `#anchor` (`forms#the-server-half`); takes `path_or_url` (or `path`)              |
| `get_api`            | Declaration, doc comment and import line of a public export; `"*"` lists them all; a miss suggests the nearest names |
| `list_examples`      | Every example and what it demonstrates                                                                               |
| `get_example`        | One example's component source                                                                                       |
| `scaffold_component` | Starting code: `basic`, `form`, `form-native` (no dependencies) or `ssr-page`, importing only installed packages     |
| `check_snippet`      | Type errors for a TypeScript module, against your project's TypeScript and `@gyral/*` versions, with suggested fixes |

Every tool description carries the recommended workflow, because many clients drop server
instructions: `start_here` once; start from `get_example` or `scaffold_component`; write a
minimal implementation; `check_snippet` it and apply the suggested fixes until it passes; use
`get_api` only to look up one specific symbol.

Resources: `gyral://llms.txt`, `gyral://skill` and `gyral://skill/references/{name}`.
Prompt: `build-gyral-component` (plan, scaffold, test and typecheck a component).

### Since 0.3.2

These are new in 0.3.2 (0.3.1 lacks them):

- `start_here`, and the workflow in every tool description.
- `scaffold_component` reads the project's `package.json` (the server's project directory, or
  `project_dir`), or takes an `installed` list of package names, and imports only packages the
  project has: with nothing known, only `@gyral/core`. It writes a model test only when
  `@gyral/testing` and `vitest` are installed. `form` uses valibot or zod 4 (and
  `@gyral/http` to submit) when installed, else the dependency-free `form-native`: `novalidate`,
  the browser's constraint checks turned into your messages all at once, and focus on the first
  invalid field.
- `check_snippet` returns a suggested fix for each TypeScript error it recognizes, plus common
  Gyral mistakes TypeScript can't see (one-call `define`, `listen` in `init`, `periodic`, side
  effects in `update`, handlers in views, list rows without a `TemplateResult` return type),
  with the runtime's G-code where there is one. Apply them and check again until it passes.
- `get_doc` accepts `path` as an alias of `path_or_url`. `get_api` suggests the nearest
  export names on a miss, and for a type the public API uses without exporting it, says how
  to name it.

## Configuration

| Variable            | Default               | Effect                                                                                                                    |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GYRAL_PROJECT_DIR` | the working directory | Where `check_snippet` finds `typescript` and `@gyral/*`                                                                   |
| `GYRAL_DOCS_URL`    | unset (bundled docs)  | Load a newer `llms-full.txt` at startup, e.g. `https://gyral.dev/llms-full.txt`; falls back to the bundled copy after 3 s |

`check_snippet` uses the TypeScript installed in your project (an optional peer dependency),
so `npx` doesn't download a second compiler.

## Public hosting

The public server at `https://mcp.gyral.dev/mcp` is live: Streamable HTTP, anonymous and
read-only. It currently serves the 0.3.1 corpus (six tools, no `start_here`) until it is
redeployed with 0.3.3; `https://mcp.gyral.dev/healthz` reports the version it serves.

`gyral-mcp http` runs it: stateless Streamable HTTP at `/mcp` with seven docs tools
(`scaffold_component` takes `installed` but no `project_dir`). It excludes `check_snippet`,
project paths and live refresh. To host your own, set `GYRAL_MCP_PUBLIC_ORIGIN` explicitly; the
default bind address is `127.0.0.1`, port 3000. `gyral-mcp http --help` lists every setting.
Deploy a pinned, reviewed package behind TLS following
[the production runbook](https://github.com/gyraljs/gyral/blob/main/docs/references/production-mcp.md).

## Command line

The package has one executable, `gyral-mcp`, so `npx -y @gyral/mcp` knows what to run:

| Command            | Runs                                                         |
| ------------------ | ------------------------------------------------------------ |
| `gyral-mcp`        | The stdio server (what `npx -y @gyral/mcp` starts)           |
| `gyral-mcp http`   | The public Streamable HTTP server, configured by environment |
| `gyral-mcp --help` | Usage for both modes (`gyral-mcp http --help` for HTTP)      |

Any other argument is an error. 0.3.2 shipped the HTTP server as a second binary,
`gyral-mcp-http`, which broke `npx -y @gyral/mcp` ("could not determine executable to run");
0.3.3 replaced it with `gyral-mcp http`. On 0.3.2, run `npx -y -p @gyral/mcp@0.3.2 gyral-mcp`.
0.3.1 has only the stdio server.

## Embedding

To run the server inside another process, as the CLI does:

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, loadCorpus, refreshDocs } from '@gyral/mcp';

let corpus = await loadCorpus(); // the bundled docs, API, examples and skill
corpus = (await refreshDocs(corpus, 'https://gyral.dev/llms-full.txt')).corpus; // optional
await createServer(corpus, { projectDir: process.cwd() }).connect(new StdioServerTransport());
```

`Corpus` and its parts (`DocPage`, `ApiEntry`, `Example`, `SkillFile`, `InternalType`, …) are
exported as types.
The tools' building blocks are internal.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.

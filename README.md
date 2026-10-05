# Gyral

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@gyral/core?label=%40gyral%2Fcore)](https://www.npmjs.com/package/@gyral/core)
[![npm provenance](https://img.shields.io/badge/npm-provenance-2ea44f?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)

**Model-View-Intent web components on the modern web platform.**
_Inspired by [Cycle.js](https://cycle.js.org)._

Gyral keeps the core idea of Cycle.js (your app is a pure function, side effects happen at
the edges as data, and data flows in one visible loop) and rebuilds it on today's platform:
custom elements and Shadow DOM, [Lit](https://lit.dev) templates, semantic HTML, modern CSS.
No stream library to learn.

```ts
import { define, html } from '@gyral/core';

type Msg = { _tag: 'Increment' } | { _tag: 'Decrement' };

define<{ count: number }, Msg>('gy-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
  },
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
  view: (s, i) => html`
    <output>${s.count}</output>
    <button type="button" data-intent=${i.Decrement}>Decrement</button>
    <button type="button" data-intent=${i.Increment}>Increment</button>
  `,
});
```

- **Intent** parses platform events (clicks, form submissions, input) into typed messages.
- **Model** is a set of pure reducers, one per message, so it is exhaustive by type.
- **View** is a pure template that _names_ intents. It holds no event-handler closures.

> Status: pre-alpha. The work plan lives in [beads](https://github.com/gastownhall/beads)
> (`bd ready`); architecture is in [ARCHITECTURE.md](ARCHITECTURE.md), decisions in
> [docs/design-docs](docs/design-docs/index.md).

Using Gyral in your own app (peer dependencies, Vite dedupe, SSR checklist):
[docs/references/consumer-setup.md](docs/references/consumer-setup.md).

## Using Gyral with AI coding agents

Gyral ships an agent skill: [skills/gyral/SKILL.md](skills/gyral/SKILL.md) plus references
for every part of the API. Every code block in it typechecks against the packages (`pnpm
invariants`), so it can't drift from the real API.

- **Claude Code:** add this repository as a plugin marketplace, then install the plugin:

  ```text
  /plugin marketplace add gyraljs/gyral
  /plugin install gyral@gyral
  ```

  From a shell: `claude plugin marketplace add gyraljs/gyral && claude plugin install gyral@gyral`.

- **Other agents (Codex, Cursor, Copilot, …):** point the agent at
  [skills/gyral/SKILL.md](skills/gyral/SKILL.md), or copy `skills/gyral/` into the agent's
  skills or rules folder. The docs for agents are at https://gyral.dev/llms.txt and
  https://gyral.dev/llms-full.txt.
- **MCP server (any MCP client):** `@gyral/mcp` searches the docs, looks up API signatures,
  returns examples, scaffolds components and typechecks snippets against your project. Claude
  Code: `claude mcp add gyral -- npx -y @gyral/mcp`; other clients in
  [packages/mcp/README.md](packages/mcp/README.md). (Published with the next release.)
- **New apps:** `npm create gyral@latest` writes an `AGENTS.md` (and a `CLAUDE.md` that
  imports it) into every project, so any agent that opens it learns the rules.

## Development

```sh
pnpm install
pnpm exec playwright install chromium
pnpm check                                   # the full gate
pnpm examples                                # run every example; index at http://localhost:5100
pnpm --filter @gyral-examples/counter dev    # run an example
pnpm ci:local                                # run CI locally (Docker + gh act)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (commits need a DCO sign-off, `git commit -s`), the
[Code of Conduct](CODE_OF_CONDUCT.md) and the [security policy](SECURITY.md). Releases:
[docs/references/releasing.md](docs/references/releasing.md).

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE) (Cycle.js attribution).

Gyral, gyraljs and the Gyral logo are trademarks of Mike Zupper. Logos and usage
guidelines: [gyraljs/brand](https://github.com/gyraljs/brand).

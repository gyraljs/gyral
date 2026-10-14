---
'@gyral/core': patch
'@gyral/router': patch
'@gyral/testing': patch
'@gyral/mcp': patch
'create-gyral': patch
---

Docs and agent guidance aligned with the code:

- `listen`'s doc comment (and so `get_api("listen")` and the API reference) starts it from `subscriptions`, not `init`, matching the guides and `check_snippet`.
- `scaffold_component`'s `ssr-page` route imports the component from `../src/`, where it is written; a test now resolves every relative import in every scaffold.
- `search_docs` ranks upgrade and migration guides below the current guides, which still answer old names such as `repeat`.
- Development error messages no longer cite internal design documents; the hydration-mismatch message links to gyral.dev. The error groups on the errors page are named "Error handling", "Subscriptions" and "Element calls".
- `retry`'s doc comment names `provideDrivers` and `el.drivers` (the spec `drivers` field was removed in 0.3.1); `@gyral/testing`'s description drops the removed schema arbitraries; the `clientOnly` comment drops a removed API.
- create-gyral's `AGENTS.md` adds the MCP server, `llms-small.txt`, the `subscriptions` rule and the real `typecheck` script.

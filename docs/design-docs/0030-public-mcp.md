# ADR 0030 — Public documentation MCP

Status: **accepted** (2026-10-11, gyral-49t.17); **deployed** at `https://mcp.gyral.dev/mcp`
(2026-10-12). The owner chose public coding-agent access and deployed it manually behind
Traefik. The HTTP server ships in `@gyral/mcp` since 0.3.2, as `gyral-mcp http` since 0.3.3
(see the addendum); the deployed image serves the 0.3.3 corpus since 2026-10-13.

The existing stdio server keeps project-local `check_snippet`. A public process serves the
read-only docs/API/example/scaffold tools (six; since 0.3.2 a seventh,
`start_here`), resources and the component prompt. It never accepts project paths (its
`scaffold_component` takes an `installed` package list instead) or executes submitted code. Its instructions require verification in
the agent's project. Scaffolding returns source text; it writes no files.

Use stateless Streamable HTTP at `/mcp`, JSON responses, one SDK server/transport per request,
disposed on response close. There are no session IDs, sticky sessions, retained conversations,
SSE subscriptions or legacy HTTP+SSE endpoints. GET/DELETE answer 405. The current dependency
is SDK 1.32.1; use its v1 APIs, not the v2 examples. The official client integration test
negotiates initialization and exercises tools, prompts and resources over actual HTTP.

The corpus is loaded once from the packed artifact. It never refreshes from a live site.
`/healthz` reports its Gyral version and SHA-256, allowing rollout/rollback verification.
Build and stage API, examples, skill and site snapshot for one release through the release
runbook. Source changes carrying 0.3.1 during development are not a new published 0.3.1 corpus.

The trusted TLS proxy preserves Host. The application rejects other Hosts and all supplied
Origins outside its explicit allowlist; non-browser agents can omit Origin. Forwarded headers
do not establish trust. Browser origins require explicit configuration. Default bounds are
16 KiB bodies, 32 concurrent requests including uploads, 600 requests/minute globally and
10-second request/inactivity timeouts. Per-client limits belong at the edge, where the actual
peer is known. This anonymous, public-information service needs no OAuth credentials. Private
tools or user data would require a separate access-policy decision.

Run with no secrets or project mounts. Log process startup, aggregate proxy status/latency and
health; do not log request bodies or prompts. SIGTERM stops acceptance and drains for up to
five seconds before closing sockets. No filesystem writes are required after installation.

The concrete container and TLS proxy setup are in
[the production runbook](../references/production-mcp.md). Official protocol basis:
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[SDK v1 server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md).

## Addendum (2026-10-12): one executable

0.3.2 shipped the HTTP server as a second bin, `gyral-mcp-http`, beside the stdio `gyral-mcp`.
npx runs a package without a named command only when it has exactly one bin or a bin named
after the unscoped package (`mcp`), so the documented `npx -y @gyral/mcp`, which every local
MCP client config uses, failed with "could not determine executable to run". The server itself
worked (`npx -y -p @gyral/mcp@0.3.2 gyral-mcp`), and `verify:install` missed it because it
started the installed bin directly.

Decision (owner, 0.3.3): `gyral-mcp` is the package's only bin. With no arguments it is the
stdio server, unchanged. `gyral-mcp http` starts this public HTTP server with the same
environment variables `gyral-mcp-http` read; `gyral-mcp --help` documents both modes, and any
other argument is an error rather than a silent stdio start. The `gyral-mcp-http` bin is
removed rather than kept as an alias, because a second bin is exactly what breaks npx. A bin
named `mcp` would also satisfy npx, but would put a generic `mcp` command on users' PATH.

The container image's default command and `deploy/mcp/compose.yaml` run `gyral-mcp http`, so a
redeploy needs an image built from 0.3.3 or later. `pack:check` now asserts the bin rule for
`@gyral/mcp` and `create-gyral`, and `verify:install` starts the packed server through
`npx --no-install @gyral/mcp`.

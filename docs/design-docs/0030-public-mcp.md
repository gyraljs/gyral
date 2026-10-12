# ADR 0030 — Public documentation MCP

Status: **accepted** for the local implementation (2026-10-11, gyral-49t.17).
Hosting and publication remain an owner decision. The owner chose public coding-agent access.

The existing stdio server keeps project-local `check_snippet`. A public process serves the
read-only docs/API/example/scaffold tools (six; the unreleased next release adds a seventh,
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

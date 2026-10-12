# Hosting the public Gyral MCP

The owner chose public access for coding agents. Proposed URL: `https://mcp.gyral.dev/mcp`.
This is a deployment recipe, not a claim that the endpoint or new HTTP binary is live.
Current registry 0.3.1 supports stdio. Implementation policy is [ADR 0030](../design-docs/0030-public-mcp.md).

## Artifact and local review

Run `pnpm check`, then prepare the packed artifact and container:

```sh
node scripts/stage-mcp-container.mjs
docker build -t gyral-mcp:review deploy/mcp
docker run --rm --name gyral-mcp-review --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 256m --cpus 1 --pids-limit 64 \
  -p 127.0.0.1:5950:3000 \
  -e GYRAL_MCP_PUBLIC_ORIGIN=http://127.0.0.1:5950 gyral-mcp:review
```

Read `http://127.0.0.1:5950/healthz` from another terminal. Review the version and
`corpusSha256` alongside the artifact hash printed by staging. Connect any Streamable HTTP
client to `http://127.0.0.1:5950/mcp`; list six tools, read `gyral://skill`, look up `define`,
and scaffold a component. `check_snippet` is absent. The official-client HTTP integration
test exercises these operations, concurrent calls and invalid requests. A SIGTERM must drain
and exit without killing the container manually.

`node scripts/verify-mcp-proxy.mjs` reviews the actual nginx configuration with a temporary
self-signed certificate and private Docker network. It checks TLS, protocol initialization,
the public tool list, Host/Origin rejection, edge rate limiting and graceful backend stop,
then removes its containers/network. It binds only loopback and changes no public DNS.
When Docker's default pools are exhausted, set `GYRAL_MCP_REVIEW_SUBNET` to an inspected
unused private subnet; the review never prunes other projects' networks.

The artifact contains docs/API/examples/skill at build time. Before production, stage a new
release's matching gyral.dev snapshot with `pnpm mcp:refresh --from <site dist>` and follow
[releasing.md](releasing.md). During development the package still says 0.3.1; do not mistake
that rebuilt corpus for the already published npm artifact. Keep the prior artifact/image
digest for rollback. Do not enable `GYRAL_DOCS_URL` for public hosting; the HTTP binary ignores it.

## Production shape

One small Node 24 container behind the existing TLS proxy is sufficient to start. Keep its
port on a private container network. Set `GYRAL_MCP_PUBLIC_ORIGIN=https://mcp.gyral.dev` and
preserve that Host at the proxy. DNS and TLS must terminate at the approved host. The provided
[nginx config](../../deploy/mcp/nginx.conf) supplies body/time bounds and per-peer limits.
If another proxy fronts nginx, replace the peer policy only after configuring a trusted
proxy network; arbitrary Forwarded/X-Forwarded-For headers must not establish client identity.

Pin the base image by digest with `--build-arg NODE_IMAGE=...` and deploy the resulting image
by digest, rather than rebuilding a mutable tag during rollout. Run as the unprivileged image
user with the same read-only/capability/resource bounds as the review command. Mount no
application checkout, API keys or user data. The service only needs its bundled corpus.

| Setting                         | Default     | Purpose                                                    |
| ------------------------------- | ----------- | ---------------------------------------------------------- |
| `GYRAL_MCP_PUBLIC_ORIGIN`       | required    | Exact public HTTPS origin; loopback HTTP for review        |
| `GYRAL_MCP_BIND`                | `127.0.0.1` | Container recipe sets `0.0.0.0` inside the private network |
| `PORT`                          | `3000`      | Internal listener                                          |
| `GYRAL_MCP_ALLOWED_ORIGINS`     | empty       | Comma-separated approved browser-client origins            |
| `GYRAL_MCP_MAX_CONCURRENT`      | `32`        | Includes uploads before dispatch                           |
| `GYRAL_MCP_REQUESTS_PER_MINUTE` | `600`       | Global process ceiling; edge limits are per client         |

Machine clients may omit Origin. Browser clients need their exact origin allowlisted; OPTIONS
supports the required protocol headers. HTTP bodies are capped at 16 KiB, request/inactivity
at 10 seconds, and draining at five seconds. GET/DELETE return 405 because this stateless
service has no server-initiated stream or sessions. Anonymous public reads need no OAuth.
Local stdio continues to typecheck against the consumer's installed packages.

## Client review

Configure a remote client for **Streamable HTTP** with URL `https://mcp.gyral.dev/mcp` after
rollout, or `http://127.0.0.1:5950/mcp` during the local container review. No token is needed.
It must process the server's initialization instructions and support tools/resources/prompts.
Read `gyral://skill`, then request task-specific docs/API/example sections instead of every
export. Validate generated code in the consumer's own installed package version. The public
endpoint cannot typecheck a checkout; project-local stdio remains the snippet-check option.

The official SDK 1.32.1 client used by `packages/mcp/test/http.node.test.ts` connects through
`Client.connect(new StreamableHTTPClientTransport(new URL(url)))`. `listTools()`,
`readResource({ uri: 'gyral://skill' })`, `callTool({ name: 'get_api', arguments: { name: 'define' } })`
and the component prompt are tested against the actual listener. Call `client.close()` when
finished. A connection should report six tools and the same version/corpus as `/healthz`.
Test a selected coding client's installed version with these operations before announcing
support for it; the SDK acceptance does not certify every client implementation.

## Operations

Monitor health/version/digest, response status, latency, restart count, memory and 429 rates.
The supplied access format logs no IPs, paths, bodies or prompts. Tune capacity from measured
traffic. Roll back by restoring the prior image digest and checking the prior corpus digest.
The app starts no timers, refresh jobs or persistent storage, and has no database to migrate.

## Hosting decisions

We still need to select the host/account, confirm control of `mcp.gyral.dev` DNS and TLS,
and choose the release artifact after the normal npm release gate. Public-access policy is
already settled. Review can happen entirely locally before any infrastructure write.
Client-specific connection instructions should be verified against installed client versions
when rollout is authorized; a client that only supports legacy HTTP+SSE should use stdio.

Protocol reference: [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

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
client to `http://127.0.0.1:5950/mcp`; list seven tools (six for a 0.3.1 artifact), read `gyral://skill`, look up `define`,
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

An HTTP server built from current source can instead serve the complete corpus from an
already published npm release:

```sh
node scripts/stage-mcp-container.mjs --released-corpus 0.3.1
```

This downloads `@gyral/mcp@0.3.1` from the public npm registry and replaces the packed
`corpus.json` wholesale. API, examples, skill and docs then all describe released 0.3.1;
new framework APIs stay out until their release. It does not publish npm or use a vendored
framework dependency. The ignored `deploy/mcp/artifact.json` records source revision,
registry integrity, corpus source/version/digests and packed artifact digest. Build from a
clean committed checkout, pin `NODE_IMAGE`, and pass `SOURCE_REVISION`, `CORPUS_VERSION` and
`CORPUS_SHA256` as build arguments. The OCI source label links the image to `gyraljs/gyral`.
Publish `ghcr.io/gyraljs/gyral-mcp:sha-<source revision>` and `:latest`; pin the registry image
digest in deployment. These image tags are independent of npm versions.

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

## Docker Compose and environment

Copy [compose.yaml](../../deploy/mcp/compose.yaml) and
[.env.example](../../deploy/mcp/.env.example) into the server's deployment directory, rename
the latter to `.env`, and fill in the published image and corpus digests. The example is
deliberately incomplete until those immutable values are supplied. `.env` supplies Compose
interpolation; the service's explicit `environment` map passes only its runtime settings.
There are no application API keys, database URLs, volumes or build-time dependencies.

The owner will deploy manually behind an existing Traefik instance. The Compose file joins
its external network and publishes no host port. Labels route `mcp.gyral.dev` to internal
port 3000, preserve Host, enable HTTPS using the existing certificate resolver, and attach
request rate/concurrency/body limits. Traefik's Docker provider must already be enabled.

Set `TRAEFIK_NETWORK` to the exact existing Docker network name, `TRAEFIK_ENTRYPOINT` to
its HTTPS entrypoint (often `websecure`), and `TRAEFIK_CERT_RESOLVER` to its configured ACME
resolver (often `letsencrypt`). These are names, not credentials; the Compose file does not
create a proxy, network or resolver. If Traefik already uses a static/default certificate,
remove the `tls.certresolver` label instead of naming a nonexistent resolver.

```sh
docker network inspect proxy
docker compose --env-file .env config --quiet
docker compose --env-file .env pull
docker compose --env-file .env up -d --wait
curl https://mcp.gyral.dev/healthz
```

Replace `proxy` in the inspection command with your network name. DNS must point to the
server and Traefik must already receive ports 80/443 for its configured certificate challenge.
The endpoint is `https://mcp.gyral.dev/mcp`; do not append `/mcp` to the public origin variable.
The middleware initially allows five requests/second with a burst of 20, eight concurrent
requests per peer, and 16 KiB bodies. It uses the immediate peer, without trusting arbitrary
forwarded IPs. If DNS is proxied through Cloudflare, configure Traefik's trusted proxy IPs
and a reviewed client-IP strategy before treating these as per-user limits.
Traefik entrypoint read/write timeouts belong to its existing static configuration; align
those with the application's ten-second bounds. Keep access logs free of bodies/prompts.
Official references: [Docker labels](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/),
[RateLimit](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ratelimit/),
[InFlightReq](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/inflightreq/) and
[Buffering](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/buffering/).

Keep `GYRAL_MCP_PUBLIC_ORIGIN=https://mcp.gyral.dev`, allowed browser origins empty for machine
agents, concurrency 32 and the global rate ceiling 600/minute initially. The health check
sends the required Host and checks `GYRAL_MCP_EXPECTED_CORPUS_SHA256`; a wrong artifact is
unhealthy even if the process answers. Run as the image's unprivileged user, read-only with
no capabilities, 256 MiB memory, one CPU, 64 PIDs, ten-second stop grace and bounded logs.
`restart: unless-stopped` handles process exits; unhealthy status needs monitoring, not an
assumed automatic restart. Roll back by restoring the previous image and corpus digests
together, pulling and repeating `up -d --wait`.

`node scripts/verify-mcp-traefik.mjs` runs this actual Compose service behind a temporary
Traefik 3.6.25 Docker provider with its real labels. It verifies corpus-aware health, no host
port, TLS routing, official SDK tools/resources/prompts, Host/Origin rejection, body/rate
limits and graceful shutdown. The local test substitutes a self-signed certificate for ACME
and discovers only its own labeled container. It reads the local Docker socket, uses an
isolated network, and removes its resources; it never contacts the production server or
changes DNS. Set `GYRAL_MCP_IMAGE` to the pulled published digest to review that artifact,
`GYRAL_MCP_REVIEW_PLATFORM` to test another architecture, and `GYRAL_MCP_REVIEW_SUBNET` to
an inspected unused subnet if Docker's default address pools are exhausted.

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
finished. A connection should report seven tools (six for a 0.3.1 artifact) and the same version/corpus as `/healthz`.
Test a selected coding client's installed version with these operations before announcing
support for it; the SDK acceptance does not certify every client implementation.

## Operations

Monitor health/version/digest, response status, latency, restart count, memory and 429 rates.
The supplied access format logs no IPs, paths, bodies or prompts. Tune capacity from measured
traffic. Roll back by restoring the prior image digest and checking the prior corpus digest.
The app starts no timers, refresh jobs or persistent storage, and has no database to migrate.

## Hosting decisions

The owner chose manual deployment on an existing server using Traefik; agent server access
is excluded. Confirm the existing network/entrypoint/resolver names and arrange
`mcp.gyral.dev` DNS/TLS during that rollout. Public access is settled. A source-built HTTP
image with the published 0.3.1 corpus can serve current users; future corpus updates follow
the matching npm/site release gate.
Client-specific connection instructions should be verified against installed client versions
when rollout is authorized; a client that only supports legacy HTTP+SSE should use stdio.

Protocol reference: [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

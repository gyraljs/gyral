# Production Node composition

`@gyral/ssr/node` adapts a Fetch handler to Node HTTP. Import `toNodeListener` in the production
entry and keep the development helper in a separate development entry. A single-file Vite
SSR build can tree-shake the unused helper, including its dynamic Vite import. Use Vite 8's
`rolldownOptions.output.codeSplitting: false`, with explicit ESM output, and bundle Gyral
packages through `ssr.noExternal`. Keep Node builtins external. If another bundler retains
the development import, measure its emitted graph before adding dependencies or changing
the public entrypoints.

`node scripts/verify-ssr-production.mjs` installs exact public npm 0.3.6 packages in a fresh
directory, builds a one-file server, removes its node_modules and client `.vite` directory,
then verifies a rendered component and its deployment metadata. It also tests HTTP request
context, WebSocket upgrade origin/path routing, request cancellation and server cleanup.
It never substitutes workspace or vendored framework packages. This is a network smoke
check, separate from the ordinary unit-test gate.

## Preserve metadata before removing build inputs

Read `componentsFromManifest(clientDir)` while `.vite` is present. `ComponentAssets.modules`
is a **Map**: `JSON.stringify(assets)` loses its entries. Store entries explicitly and restore
with `new Map(entries)`. Keep loader, preload, scripts and each component's stylesheet/preload
lists. Embed that data in the server build or ship a separately validated deployment JSON.
Similarly preserve the ordinary client entry, stylesheets and modulepreload lists needed by
your route renderer. No runtime Vite manifest is necessary once that information is retained.

Code and deployment data can be separate artifacts, but their release identifier and asset
hashes must agree. Deploy assets before switching the server's metadata. Retain old hashed
files for old tabs and rollback. Do not bake mutable application records into a build just
to retain an asset map. The client assets still need a static server or CDN even when the
API bundle is one file.

## Compose the host server

Create the HTTP server with `createServer(toNodeListener(app.fetch, { origin }))`, or dispatch
API/static requests and page requests through one Fetch handler. The handler receives
`{ incoming, remoteAddress }`: request IDs, authenticated identity, logging and metrics belong
to the application. `remoteAddress` is the immediate socket peer. Trust forwarded headers
only when that peer is an approved proxy; configure a fixed public `origin` when producing
absolute URLs. User-controlled Host or forwarded fields must not establish that origin.

Handle `server.on('upgrade', …)` separately for WebSockets. Match the route and validate
Origin/authentication before handing the socket to the application's WebSocket server.
HTTP CORS does not authorize WebSocket upgrades. Apply body limits, timeouts and admission
policies at the app/edge boundary; this adapter supplies Request/Response streaming and
backpressure, rather than a server security or telemetry configuration.

Carry `request.signal` into cancellable reads and rendering work. Disconnect cancels the
response stream and aborts pending work; it cannot undo an already committed transaction.
On termination stop accepting HTTP/upgrades, drain admitted work within an explicit budget,
close WebSocket clients, dispose app-owned resources, and exit. Removing one component in
the browser never disposes the shared server or browser application runtime.

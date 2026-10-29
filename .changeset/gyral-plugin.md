---
'@gyral/core': patch
'@gyral/ssr': patch
---

`gyral()` from `@gyral/core/vite` is Gyral's Vite plugin list: `plugins: [gyral(), mine()]`,
with nothing to spread or merge (gyral-337.3). `gyralVitePreset()` still works through 0.3.x.
In dev, the app's direct dependencies that use Gyral (a design system, a widget library) are
pre-bundled with core, and `optimize: 'auto'` points Vite's startup scan at the modules that
define components and at a Vitest browser project's tests, so Vite stops discovering their
imports mid-run; it is on by default when Vite runs as a custom server.

`gyralDevServer` builds the app once per server-module version, not per request, and
`gyralDevMiddleware` (`@gyral/ssr/node`) runs the dev server inside an Express, Connect or
Fastify server of your own (gyral-337.12).

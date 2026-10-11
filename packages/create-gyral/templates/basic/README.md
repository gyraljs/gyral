# Gyral app

Created with `npm create gyral`: a [Gyral](https://gyral.dev) component, Model-View-Intent on
web components.

| Command           | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Start the dev server                            |
| `npm test`        | Run the tests in Chromium (Vitest browser mode) |
| `npm run build`   | Type-check and build to `dist/`                 |
| `npm run preview` | Serve the production build                      |

The first test run needs a browser: `npx playwright install chromium`.

Start in `src/counter.ts`. Docs: [gyral.dev/docs](https://gyral.dev/docs/).

## Client-only builds

This app renders only in the browser, so `vite.config.ts` sets
`gyralVitePreset({ clientOnly: true })`: builds leave out Gyral's hydration code (about 1 KiB
gzip). Tests reuse the same config.

**Turn it off when any page is rendered on a server or prerendered** (for example when you add
`@gyral/ssr`): delete `clientOnly: true` in `vite.config.ts`. With it on, server-rendered
components can't hydrate; they render again from scratch, and development builds warn. For a
server-rendered app from the start, use `npm create gyral -- --template ssr`.

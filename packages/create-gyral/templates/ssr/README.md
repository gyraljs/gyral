# Gyral app (server-rendered)

Created with `npm create gyral -- --template ssr`. Pages are rendered on the server with
[Gyral](https://gyral.dev), prerendered to static HTML at build time, and hydrated in place in
the browser. They work before any JavaScript loads.

| Command           | What it does                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `npm run dev`     | Dev server: Vite for client modules, every page server-rendered           |
| `npm test`        | Server-rendering tests (Vitest, Node)                                     |
| `npm run build`   | Type-check, build the client to `dist/client`, prerender to `dist/static` |
| `npm run preview` | Serve the production build                                                |

## Where things are

- `src/home-page.ts`: the page, a light-DOM component (`shadow: false`), styled by
  `src/styles.css`.
- `src/counter.ts`: a widget in shadow DOM.
- `src/entry-client.ts`: the browser entry. `@gyral/ssr/hydrate` must stay its first import.
- `server/app.ts`: renders each page. Add a route there and its path to `staticPaths` to
  prerender it.

Docs: [gyral.dev/docs](https://gyral.dev/docs/).

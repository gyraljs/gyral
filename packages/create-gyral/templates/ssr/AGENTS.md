# AGENTS.md

A [Gyral](https://gyral.dev) app: Model-View-Intent web components with Gyral's own view layer,
rendered on the server, prerendered to static HTML and hydrated in place. Pages work before JavaScript loads.
This file tells coding agents how the project works.

## Commands

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Dev server: every page server-rendered, Vite for client modules |
| `npm test`          | Server-rendering tests (Vitest, Node); run after every change   |
| `npm run typecheck` | `tsc --noEmit` (strict)                                         |
| `npm run build`     | Type-check, build the client, prerender to `dist/static`        |
| `npm run preview`   | Serve the production build                                      |

## Where things are

- `src/home-page.ts`: the page, a light-DOM component (`shadow: false`) styled by
  `src/styles.css`.
- `src/counter.ts`: a widget in shadow DOM (`styles` inside).
- `src/entry-client.ts`: browser entry: imports the components (hydration is built in).
- `server/app.ts`: renders each page with `renderPage`. Add a route there, and its path to
  `staticPaths` to prerender it. `server/app.test.ts` tests the rendered HTML. Pages send a
  `Content-Security-Policy` whose `style-src` lists style hashes (`contentSecurityPolicy`):
  put CSS in `src/styles.css` or a component's `styles`, not in `style="…"` attributes.

## Gyral rules (follow them in every change)

1. Each component: `define<State, Msg>('app-name', { init, intent, update, view })`.
   Messages are tagged unions (`{ readonly _tag: 'Name' }`); `update` handles every tag.
2. Views are pure and name intents: `data-intent=${i.Save}`. Never `@click=${…}` or any
   closure. Override the trigger event with `data-intent-on="keydown"`.
3. Reducers are pure: no `fetch`, timers, `Math.random`, `Date.now`, DOM or storage. Return
   `[nextState, [command]]`; commands run in the browser only.
4. Server render is synchronous: load data in the request handler and pass it as props or
   store instances (`renderPage({ stores })`); never fetch while rendering.
5. State, props and store state must be JSON-serializable (they are the hydration seed) and
   must never hold secrets. Server and client must render the same markup for the same state.
6. Form state uses attributes: `value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`,
   never `.value=`/`.checked=`. Lists: `each(items, key, row, pick?)` with pure rows. For
   JS-only UI, switch in the `Hydrated` reducer.
7. Page-level content in light DOM (`shadow: false`, document CSS); widgets in shadow DOM.
8. Forms: one schema for `form()` (client) and `formAction` (server, works without JS).
9. Use semantic HTML and modern CSS in `@layer component` inside `styles`.

## Testing approach

- Render pages through `createApp(...).fetch(new Request(url))` and assert on status and HTML.
- Test reducers without a DOM: `step(Component.spec, state, msg)`, `run(Component.spec, msgs)`
  from `@gyral/testing`.
- For hydration in a browser, use `mountSsr(html)` and `await hydrated(page)`.

## Learn more

- Agent skill for Claude Code: `/plugin marketplace add gyraljs/gyral`, then
  `/plugin install gyral@gyral` (other agents: https://github.com/gyraljs/gyral/tree/main/skills/gyral).
- Docs for agents: https://gyral.dev/llms.txt · Docs: https://gyral.dev/docs/

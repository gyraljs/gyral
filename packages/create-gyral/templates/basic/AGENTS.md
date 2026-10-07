# AGENTS.md

A [Gyral](https://gyral.dev) app: Model-View-Intent web components with Gyral's own view layer,
client-rendered with Vite. This file tells coding agents how the project works.

## Commands

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                           |
| `npm test`          | Vitest in Chromium (browser mode); run after every change |
| `npm run typecheck` | `tsc --noEmit` (strict)                                   |
| `npm run build`     | Type-check and build to `dist/`                           |
| first test run      | `npx playwright install chromium` (once per machine)      |

## Where things are

- `src/counter.ts`: a component (`define()`): state, messages, intent, update, view, styles.
- `src/counter.test.ts`: model tests without a DOM (`step`, `run`) and a browser test.
- `src/main.ts`: the entry; imports components and the page CSS (`src/styles.css`).
- `index.html`: the page that uses the components.
- `vite.config.ts`: `gyralVitePreset({ clientOnly: true })`, because this app renders only in
  the browser (no hydration code in builds). Delete `clientOnly: true` before adding server
  rendering or prerendering (`@gyral/ssr`); `vitest.config.ts` reuses this config.

## Gyral rules (follow them in every change)

1. Each component: `define<State, Msg>('app-name', { init, intent, update, view })`.
   Messages are tagged unions (`{ readonly _tag: 'Name' }`); `update` handles every tag.
2. Views are pure and name intents: `data-intent=${i.Save}`. Never `@click=${…}` or any
   closure. Override the trigger event with `data-intent-on="keydown"`.
3. Intent parsers validate input and return a message or `undefined`.
4. Reducers are pure: no `fetch`, timers, `Math.random`, `Date.now`, DOM or storage. Return
   `[nextState, [command]]` and use `@gyral/http`, `@gyral/time`, `random()` or a driver.
5. Props are read-only (`ctx.props`); they enter state in `init(props)` or a `PropsChanged`
   reducer. Children report up with `emit()`; parents read outputs with `child()`.
6. Shared state goes in a store: `defineStore`, `spec.stores`, `ctx.read(store)`,
   `send(store, msg)`.
7. Prefer plain data in state (it must be JSON only if a component is later server-rendered). Import `html`, `css`, `each` and hooks from `@gyral/core`.
   Lists: `each(items, key, row, pick?)` with pure rows (view values through `pick`). Form
   state: `value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`. Props: `prop.*`.
8. Use semantic HTML (real buttons, labels, forms, `<output aria-live>`) and modern CSS in
   `@layer component` inside `styles`.

## Testing approach

- Test every reducer without a DOM: `step(Component.spec, state, msg)`,
  `run(Component.spec, [msgs])`; assert on returned commands with `inputsFor`/`resolve`.
- Test the element in the browser with fake drivers: `el.drivers = { http: fakeHttp() }`
  (`@gyral/http/testing`), `fakeDriver(...)` and `virtualTime()` from `@gyral/testing`.
- No jsdom. `await settled()` (from `@gyral/core`) before asserting on the DOM.

## Learn more

- Agent skill for Claude Code: `/plugin marketplace add gyraljs/gyral`, then
  `/plugin install gyral@gyral` (other agents: https://github.com/gyraljs/gyral/tree/main/skills/gyral).
- Docs for agents: https://gyral.dev/llms.txt · Docs: https://gyral.dev/docs/

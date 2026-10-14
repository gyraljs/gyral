---
name: gyral
description: Build web apps and components with Gyral (@gyral/core, @gyral/ssr, @gyral/http, @gyral/router, @gyral/time, @gyral/testing, @gyral/devtools, create-gyral) — Model-View-Intent custom elements with their own view layer, server rendering that hydrates in place, effects as data, and DOM-free tests. Use whenever code imports @gyral/*, calls define()/defineStore()/command(), uses data-intent markup, or the user asks for a Gyral app, component, form, store, driver, SSR page or test.
---

# Building with Gyral

Gyral compiles a **Model-View-Intent** spec into a standard custom element, rendered by
Gyral's own view layer (`html`, `css`, `each` and hooks, all from `@gyral/core`).
Every component is one loop: **intent** parses DOM events into typed messages, **update** is
one pure reducer per message, **view** is a pure function of state. Side effects are
**commands** (data) that drivers perform. Pages render on the server with Declarative Shadow
DOM and hydrate in place (see `references/ssr.md`).
Docs: https://gyral.dev/docs/ · API: https://gyral.dev/docs/api/

## Start from working code

Write code early, from an example close to the task, instead of reading the API type by type:

1. **Recipes** (https://gyral.dev/docs/recipes/): task-sized components with tests, such as a
   todo list with filters and a signup form with native validation. For a form, start from
   `references/forms.md`, which leads with the same native path.
2. **The agent pack** (https://gyral.dev/llms-small.txt): the rules, one complete component,
   the recipes and an import map in one small file.
3. **With the Gyral MCP server** (below): `start_here` once → `get_example` or
   `scaffold_component` (`form-native` for a form) → write the module → `check_snippet` until
   it passes. Call `get_api` only for a name you already saw in an example or in an error;
   you rarely write Gyral's types yourself, TypeScript infers them from `define()`.

## The shape of every component

```ts
import { define, html } from '@gyral/core';

interface State {
  readonly count: number;
}
type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<State, Msg>()('my-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: true,
    Decrement: true,
  },
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
  view: (s, i) => html`
    <p>Count: <output aria-live="polite">${s.count}</output></p>
    <button type="button" data-intent=${i.Decrement}>−</button>
    <button type="button" data-intent=${i.Increment}>+</button>
  `,
});
```

**Import every component module from the entry.** `define()` registers the tag when its
module runs. A component in its own file (`src/signup-form.ts`) needs a side-effect import in
the entry module, or in a module the entry imports: `import './signup-form.js';` in
`src/main.ts`. Without it the tag is never defined, and `<signup-form>` stays an empty unknown
element. Since 0.3.6, development builds warn (G0014) when a tag is still undefined 3 s after
load; production builds stay silent.

## Golden rules

1. **Messages are tagged unions** (`{ readonly _tag: 'Name'; … }`), and `update` must have a
   reducer for **every** tag (exhaustive by type). Components are `define<State, Msg>()(tag,
spec)` (two calls): the keys of `intent` are the intent names markup uses. A key that is a
   tag parses into that variant; any other key may produce any message (intent.md).
2. **Views are pure and name intents; they never attach closures.** Write
   `data-intent=${i.Save}`, never `@click=${() => …}`. The trigger is the element's default
   event (button → click, form → submit, input/textarea → input, select/checkbox → change,
   child component → its outputs); override with `data-intent-on="keydown"`.
3. **Reducers are pure.** No `fetch`, timers, `Math.random`, `Date.now`, DOM or `localStorage`
   in `update`/`init`/`view`. Return `[nextState, [command, …]]` and let a driver do it.
4. **Intent parsers validate.** Return a message, `undefined` (decline: the next intent outward
   gets the event) or let `form()`/`field()` produce `IntentRejected`. Never trust `value`
   without checking it.
5. **Props are read-only context** (`ctx.props`), declared with `prop.*` builders
   (Standard Schema; attributes are kebab-case and always validated). They enter state only
   through `init(props)` and the optional `PropsChanged` reducer.
6. **Server-rendered state is JSON.** State, props and store state of anything rendered on
   the server travel to the browser in hydration seeds, so they must survive a JSON round trip
   (no `Map`, class instances, functions or `Date` objects; the server warns). Client-only
   components have no seed and may hold other values (an Effect `Option`, a `Map`); plain data
   still keeps tests, devtools previews and a later move to SSR simple.
7. **Import the view layer from `@gyral/core`** (`html`, `css`, `nothing`, `each`, `raw`,
   `defineHook`, `invalid`). Spread `gyralVitePreset()` (from `@gyral/core/vite`)
   into the Vite/Vitest config: `vite build` then compiles templates and checks their rules; add
   `gyral.configs.recommended` from `@gyral/core/eslint` to see them in the editor. An app no
   server renders passes `{ clientOnly: true }` to leave the hydration code out (about 1 KiB).
8. **Lists use `each(items, key, row, pick?)` with pure rows**: a row reads only its
   arguments and module constants; name intents with a module-level
   `const i = intentsOf<typeof C>()` (give such a row a `TemplateResult` return type) and pass
   view values (the selection) through `pick`. Form state uses
   attributes (`value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`), never `.value=`;
   they are written only when the model's value changes, so other renders keep user edits.
9. **Test the model without a DOM** (`step`, `run` from `@gyral/testing`) and the element in a
   real browser (Vitest browser mode) with fake drivers; `await settled()` before asserting on
   the DOM. No jsdom.
10. **Page-level content uses light DOM** (`shadow: false`) so crawlers and document CSS see
    it; widgets keep shadow DOM and `styles`.

## Start a project

```text
npm create gyral@latest my-app -- --template basic   # client-rendered
npm create gyral@latest my-app -- --template ssr     # prerendered + hydrated
```

Upgrading a 0.2 app (0.2 rendered with Lit; 0.3 has its own view layer): follow
https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md.

Manual install: `npm i @gyral/core` (+ `@gyral/ssr` for SSR, `@gyral/http @gyral/router
@gyral/time` as needed, `-D @gyral/testing`). tsconfig:
`strict`, `moduleResolution: "bundler"`.

## With the Gyral MCP server

The MCP server runs locally over stdio (`npx -y @gyral/mcp`, which has `check_snippet`), or is
hosted at `https://mcp.gyral.dev/mcp` (Streamable HTTP, no token; every tool except
`check_snippet`; its `/healthz` reports the release it serves). When the
`gyral` MCP tools are available, work in this loop rather than
reading the docs end to end:

1. `start_here` once: the rules, the workflow and an index from use case to example and guide.
2. Start from code: `get_example` (the closest example) or `scaffold_component` (`basic`,
   `form`, `form-native`, `ssr-page`; it imports only installed packages, read from
   `package.json` by the local server; pass `installed` to the hosted one).
3. Write a minimal implementation of the task right away.
4. `check_snippet` the whole module: type errors plus a suggested fix for each, and common
   Gyral mistakes TypeScript can't see. Apply the fixes and check again until it passes. It
   needs the project's TypeScript 5 or 6 (TypeScript 7 has no compiler API); otherwise run
   the project's typecheck.
5. `get_api` only for one name you already saw in an example or in an error, not to walk the
   types; `search_docs` and `get_doc` for one concept you need.

`start_here`, `form-native`, the installed-package checks and the suggested fixes are in
`@gyral/mcp` since 0.3.2; 0.3.1 has the other tools and the same loop. On 0.3.2 exactly,
`npx -y @gyral/mcp` fails with "could not determine executable to run"; use 0.3.3 or later, or
`npx -y -p @gyral/mcp@0.3.2 gyral-mcp`. Self-hosting the HTTP server is `gyral-mcp http`.

## Decision tables

**Where does this state live?**

- Only this component cares → component state (`init` + `update`).
- Comes from the parent → a prop (`props` + `ctx.props`; copy into state via `PropsChanged`).
- Several components read and change it (cart, session) → a store (`defineStore`, `stores`,
  `ctx.read(store)`, `send(store, msg)`).
- A child must tell its parent something → an output (`const emit = outputs<Out>()` in the
  child, `child()` intent in the parent; plain DOM listens for `OUTPUT_EVENT`).
- It already lives outside Gyral (a signals store, Redux, XState, a socket) → keep it there;
  read it with a `subscription()` command, write with a plain driver (outside-stores.md).

**Which concurrency for a command?** (per lane = `key`, default the driver name)

- Search as you type, latest wins → `switch`. Submit button → `exhaust`.
- Ordered saves → `queue`. Independent fire-and-forget → `merge` (default).

**Which package?** HTTP → `@gyral/http` (`get`, `request`, `submitForm`). Timers →
`@gyral/time` (`delay`, `debounce`, `every`). URLs → `@gyral/router`
(`listen`, `navigate`, `routes`). Randomness → a small driver (effects-and-drivers.md
"Recipes"). A store or feed
Gyral doesn't own (signals, Redux, XState, WebSocket) → `subscription()` in core
(`references/outside-stores.md`). Anything else → `defineDriver()` + `command()`.

## References (read on demand)

- `references/components.md` — `define()` spec fields, `prop.*` builders, `css` styles, light DOM, custom states, view transitions
- `references/intent.md` — `data-intent`, triggers, `IntentInput`, parsers, outputs from children
- `references/update-and-commands.md` — `Next`, commands, `init` commands, framework messages, `subscriptions` for long-lived work
- `references/view.md` — template rules, live form state, `each` with pure rows, element hooks (`defineHook`, with `dispose` for teardown), widgets with a lifecycle, `focus`
- `references/effects-and-drivers.md` — drivers, `command()`, concurrency, retry, streaming, http/time/router, substitution
- `references/browser-storage.md` — optional localStorage and IndexedDB drivers, typed decoding, watches, transactions, migrations, SSR ordering
- `references/network-streams.md` — optional native EventSource/WebSocket drivers, typed codecs, connection lifetime and transport limits
- `references/outside-stores.md` — `subscription()` over signals, Redux-style stores, sockets; stores provided per page; testing them
- `references/composition.md` — props and `PropsChanged`, child components and outputs, stores
- `references/forms.md` — native validation first (`novalidate`, `validity`, `focus`, one complete signup form), then `IntentRejected`/`fieldErrors`/`invalid()`, and a schema library with `form()`/`field()`, `formAction` and the no-JS path
- `references/ssr.md` — `renderPage`, hydration, seeds, prerender, islands, light DOM, CSP
- `references/testing.md` — `step`/`run`, command assertions, `settled()`, fake drivers, `fakeHttp`, virtual time, SSR/hydration tests (`renderOnServer`, golden fixtures)
- `references/errors.md` — what happens when init, a reducer, the view, a parser, a command or a hook throws; `spec.error`, `Errored`, parent boundaries (`data-intent-on="error"`), `reportError` and monitoring, server isolation
- `references/devtools.md` — the dev-only timeline panel
- `references/anti-patterns.md` — idioms, anti-patterns, and common errors with fixes
- `references/workloads.md` — state-owned sequences, workers, authoritative drafts, held input, readiness and lifetime boundaries
- `references/production.md` — strict CSP, Node composition, offline workspace assets and Rust rendering contracts

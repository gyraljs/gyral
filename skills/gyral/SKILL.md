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

## The shape of every component

```ts
import { define, html } from '@gyral/core';

interface State {
  readonly count: number;
}
type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<State, Msg>('my-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
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

## Golden rules

1. **Messages are tagged unions** (`{ readonly _tag: 'Name'; … }`). The tag is also the
   intent name in markup. `update` must have a reducer for **every** tag (exhaustive by type).
2. **Views are pure and name intents; they never attach closures.** Write
   `data-intent=${i.Save}`, never `@click=${() => …}`. The trigger is the element's default
   event (button → click, form → submit, input/textarea → input, select/checkbox → change,
   child component → its outputs); override with `data-intent-on="keydown"`.
3. **Reducers are pure.** No `fetch`, timers, `Math.random`, `Date.now`, DOM or `localStorage`
   in `update`/`init`/`view`. Return `[nextState, [command, …]]` and let a driver do it.
4. **Intent parsers validate.** Return a message, `undefined` (ignore the event) or let
   `form()`/`field()` produce `IntentRejected`. Never trust `value` without checking it.
5. **Props are read-only context** (`ctx.props`), declared with `prop.*` builders
   (Standard Schema; attributes are kebab-case and always validated). They enter state only
   through `init(props)` and the optional `PropsChanged` reducer.
6. **Server-rendered state is JSON.** State, props and store state of anything rendered on
   the server travel to the browser in hydration seeds, so they must survive a JSON round trip
   (no `Map`, class instances, functions or `Date` objects; the server warns). Client-only
   components have no seed and may hold other values (an Effect `Option`, a `Map`); plain data
   still keeps tests, devtools previews and a later move to SSR simple.
7. **Import the view layer from `@gyral/core`** (`html`, `css`, `nothing`, `each`, `raw`,
   `defineHook`, `defineDisposableHook`, `invalid`, `labelledBy`). Spread `gyralVitePreset()`
   into the Vite/Vitest config: `vite build` then compiles templates and checks their rules; add
   `gyral.configs.recommended` from `@gyral/core/eslint` to see them in the editor. An app no
   server renders passes `{ clientOnly: true }` to leave the hydration code out (about 1 KiB).
8. **Lists use `each(items, key, row, pick?)` with pure rows**: a row reads only its
   arguments and module constants; name intents with a module-level `const i = intents<Msg>()`
   and pass view values (the selection) through `pick`. Form state uses
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
`@gyral/time` (`delay`, `debounce`, `periodic`, `animationFrames`; delays only:
`@gyral/time/delay`). URLs → `@gyral/router`
(`listen`, `navigate`, `routes`). Randomness → `random()`/`randomInt()` in core. A store or feed
Gyral doesn't own (signals, Redux, XState, WebSocket) → `subscription()` in core
(`references/outside-stores.md`). Anything else → `defineDriver()` + `command()`.

## References (read on demand)

- `references/components.md` — `define()` spec fields, `prop.*` builders, `css` styles, light DOM, custom states, view transitions
- `references/intent.md` — `data-intent`, triggers, `IntentInput`, parsers, outputs from children
- `references/update-and-commands.md` — `Next`, commands, `init` commands, framework messages
- `references/view.md` — template rules, live form state, `each` with pure rows, element hooks (`defineHook`, `defineDisposableHook`, `labelledBy`), widgets with a lifecycle, `focus`
- `references/effects-and-drivers.md` — drivers, `command()`, concurrency, retry, streaming, http/time/router, substitution
- `references/outside-stores.md` — `subscription()` over signals, Redux-style stores, sockets; stores provided per page; testing them
- `references/composition.md` — props and `PropsChanged`, child components and outputs, stores
- `references/forms.md` — `form()`/`field()`, `IntentRejected`, `invalid()`, `formAction` and the no-JS path
- `references/ssr.md` — `renderPage`, hydration, seeds, prerender, islands, light DOM, CSP
- `references/testing.md` — `step`/`run`, command assertions, `settled()`, fake drivers, `fakeHttp`, virtual time, SSR tests
- `references/devtools.md` — the dev-only timeline panel
- `references/anti-patterns.md` — idioms, anti-patterns, and common errors with fixes

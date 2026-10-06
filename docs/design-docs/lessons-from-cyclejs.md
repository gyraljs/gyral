# Lessons from Cycle.js

Source studied: the Cycle.js monorepo (`run`, `dom`, `isolate`, `state`, `http`, `history`,
`time`, `html`, `rxjs-run`, `most-run`, `devtool`), kept locally in `archive/` (gitignored).

## Keep

- `main(sources) → sinks`: a pure app with effects in drivers, which makes it testable
  without a DOM.
- Model-View-Intent separation.
- Effects as data (request descriptions, history commands).
- Fractal components: every component is a small app.
- Deterministic async tests (`@cycle/time`'s virtual time).

## Drop (and why it hurt)

| Cycle.js                                | Problem                                         | Gyral replacement                             |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Streams for everything                  | Steep learning curve; mixed up events and state | Messages + reducers; stores for shared state  |
| xstream / RxJS / most adapters          | Tripled the API surface                         | No stream library                             |
| `DOM.select('.cls').events()`           | Stringly-typed, fragile, heavy delegation code  | Typed `data-intent` names, parsed intents     |
| `isolate()` scopes                      | The most complex part of the codebase           | Shadow DOM                                    |
| Snabbdom VDOM                           | Diffing overhead                                | Gyral templates (fine-grained parts)          |
| Sink proxies in `run()`                 | Hard to follow circular wiring                  | Element-owned loop                            |
| `@cycle/state` lenses, `makeCollection` | Awkward lists                                   | Child elements + `each()`                     |
| `@cycle/html`                           | Little SSR story                                | `@gyral/core/server` + Declarative Shadow DOM |
| Cycle-only components                   | No interop                                      | Standard custom elements                      |
| TS 3.2, tslint, karma                   | Unmaintained tooling                            | TS strict, ESLint, Vitest browser mode        |

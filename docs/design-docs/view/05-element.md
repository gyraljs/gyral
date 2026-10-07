# 05 — The element and its props

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018 (decision E). Phase 3. Amends ADR 0007
(props).

`define(tag, spec)` creates a plain `HTMLElement` subclass and registers it. There is no
reactive-element base class: no per-property update promises, no attribute converters, no
reflection, no controllers, no lifecycle hooks for users. The spec (intent, update, view) is the
only API.

## Props

Props are declared with **Standard Schema** (`@standard-schema/spec`, already a core
dependency), so "parse at boundaries" (core belief 3) covers component inputs too.

```ts
import { define, prop } from '@gyral/core';
import * as v from 'valibot';

define('shop-filter', {
  props: {
    label: prop.string({ required: true }), // attribute "label"
    minPrice: prop.number({ default: 0 }), // attribute "min-price"
    open: prop.boolean(), // attribute "open", presence = true
    sort: prop.string({ schema: v.picklist(['price', 'name']), default: 'price' }),
    filters: prop.json(Filters, { attribute: 'filters' }), // JSON in an attribute
    items: prop.value(v.array(Item), { default: [] }), // property only
  },
  // …
});
```

| Builder                     | Attribute parsing                      | Default attribute name |
| --------------------------- | -------------------------------------- | ---------------------- |
| `prop.string(opts?)`        | as is                                  | kebab-case of the prop |
| `prop.number(opts?)`        | `Number(v)`; empty or `NaN` is invalid | kebab-case             |
| `prop.boolean(opts?)`       | present → `true`, absent → `false`     | kebab-case             |
| `prop.json(schema, opts?)`  | `JSON.parse(v)`, then the schema       | kebab-case             |
| `prop.value(schema, opts?)` | none: property only                    | none                   |

`prop.json` and `prop.value` take a Standard Schema or, since 0.3.1 (gyral-c5d.7), a plain type
guard `(u: unknown) => u is T`; the prop's type is the guard's `T`. A guard that returns false
is reported like a schema issue (`failed isSeat`, the guard's name).

Options: `schema` (refines `string`/`number`/`boolean`), `attribute` (a name, or `false` for
property only), `required`, `default`. The honesty rule of ADR 0007 stays: a prop whose type
excludes `undefined` must be `required` or have a `default`. Prop types are inferred from the
schemas' output types. `prop.boolean()` defaults to `false` (an absent attribute).

`default` replaces only `undefined` (`readProps` in `props.ts`): setting a prop to `undefined`
or removing its attribute means "missing", so the default comes back. For an explicit "nobody"
or "none" next to a default, use `null` with a nullable schema
(`prop.value(v.nullable(User), { default: owner })`, or `prop.json` with the attribute
`"null"`); `null` is a value and passes through (`packages/core/test/prop-null.test.ts`).

Typing: `define()` infers the props type from the builders when it gets no type arguments.
With explicit `define<State, Msg, Props>`, each builder must produce its prop's type (a builder
without `required`/`default` produces `T | undefined`); `PropsOf<typeof props>` derives `Props`
from a table of builders.

The `string`/`number`/`boolean` builders carry tiny built-in schemas, so simple props need no
schema library.

### When props are validated

| Input                                             | Validated                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| An attribute (from HTML, the server, or a script) | **always**: it's an external string, a boundary  |
| A property set (`.items=${…}`, `el.items = …`)    | development only: it comes from typed Gyral code |
| A hydration seed (07)                             | development only: it is Gyral's own output       |

- An invalid value is logged with the tag, prop and schema issues. The prop is then treated as
  missing, so `default` or the `required` warning applies.
- Schemas must be synchronous (a `Promise` from `validate` is a definition error, thrown where
  it is detected; from `attributeChangedCallback` the platform reports it instead) and should
  validate rather than transform. In development, a property set whose validated output differs
  structurally from its input (plain arrays and objects compared by content, so schemas that
  copy are fine) warns, and the input is kept, because production doesn't run the schema on
  property sets.
- **Identity:** a property set keeps the object it was given. Development validates it and
  then stores the input, not the schema's output (a schema that copies, as most object schemas
  do, changes nothing); production skips the schema. So `el.items === items` after
  `el.items = items`, a parent can compare identities, and a schema that decodes (strings to
  `Date`s, defaults filled in, unknown keys stripped) would do it only for attributes. Schemas
  for properties should **check, not decode**; a type guard is the simplest check. Attributes
  are the exception: their value is the parse's output (a string has no identity to keep).
- No property-to-attribute reflection. State that CSS needs goes through custom states
  (`spec.states`).

### Accessors and upgrade capture

- Each declared prop is an accessor on the class prototype. The setter compares with
  `Object.is` and marks the host dirty on change (04).
- **Upgrade capture:** a parent may set a property before the element's class is defined (lazy
  chunks do this). That creates an own property that hides the accessor. In the constructor,
  each declared prop that exists as an own property is read, deleted and set again through the
  accessor.
- A prop named like a built-in element property (`hidden`, `title`, `id`, …) is a definition
  error in development and a warning in production.

## Lifecycle

| Callback                   | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor`              | Upgrade capture. No DOM work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `connectedCallback`, first | Read the seed (resume). A host with a seed or `defer-hydration` first waits for the lazily loaded hydration code (07 "Loading"). With `defer-hydration`, schedule the island and stop (07). Otherwise find the root: an existing (declarative) shadow root, or `attachShadow({ mode: 'open' })`, or the host itself for `shadow: false`; adopt the shared sheets (08; a hydrating root adopts them in its style swap, 07); run `init(props)` unless resumed; add intent listeners to the root once; connect stores and run commands kept from `init` (the interpreter starts with the first command); mark dirty. A resumed host with a non-empty root hydrates it in its first render (07); a shadow root without a seed is cleared. |
| `connectedCallback`, later | A move without `moveBefore`: re-resolve stores and providers (the nearest may differ); the interpreter, disposed on disconnect, restarts with the next command. No re-render unless something changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `connectedMoveCallback`    | Defined and empty: a `moveBefore()` move keeps everything (03).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `disconnectedCallback`     | Dispose the interpreter (running commands' signals abort synchronously, ADR 0006), unsubscribe stores, run element hooks' `dispose` (02; the host then re-renders on reconnect, where those hooks run `client` again). State is kept for a later reconnect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `attributeChangedCallback` | Prop attributes: parse, validate, set. `defer-hydration` removed: release the island (07).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

`observedAttributes` lists the props' attribute names plus `defer-hydration`.

## Public instance API

| Member              | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| declared props      | inputs (accessors)                                       |
| `state` (read-only) | current model state                                      |
| `send(msg)`         | dispatch a message                                       |
| `drivers`, `stores` | per-instance overrides (ADR 0006, ADR 0013)              |
| `initialMessages`   | messages applied after `init` (form re-render, ADR 0008) |

Gone: `updateComplete`, `requestUpdate`, `renderRoot`, `hasUpdated`, all `LitElement`
members. Tests use `settled()` (04).

## Features register themselves (gyral-g1r.18)

The element reaches optional machinery only through slots in `packages/core/src/features.ts`,
which each feature's own API fills when it is first called. An app that never calls the API
doesn't bundle the code (static imports from the API's module; nothing runs at load time, so
`sideEffects: false` and tree-shaking work as usual):

| Slot       | Filled by                         | Brings                                                     |
| ---------- | --------------------------------- | ---------------------------------------------------------- |
| `commands` | `command()`                       | the interpreter and driver resolution (`internal/`)        |
| `stores`   | `defineStore()`                   | the store binding and store scopes (ADR 0013)              |
| `props`    | the prop builders (`prop.string`) | attribute parsing, validation, defaults, required warnings |

**Spec fields (gyral-c5d.12, 0.3.1).** Three features are reached through plain spec data, so
no API call can register them: view transitions (`viewTransition`, 04), the frame lane
(`renderOnFrame`, 04) and custom states (`states`, "ElementInternals" below). Core reaches them
through the `#spec-features` import: by default (the runtime path, no build step)
`spec-features.ts` carries all three; with the `gyral-compiled` condition (builds with the Vite
preset) `spec-features-used.ts` is a set of empty slots. The template compiler scans every
module the client build transforms, dependencies included (`compiler/features.ts`), and adds
`import "virtual:gyral-use/<feature>"` at the end of each module that names a field: that
side-effect module calls `register()` in core's `use-transitions.ts`, `use-frame-lane.ts` or
`use-states.ts`, which fills the slot before the naming module runs (imports run first). The
scan is a sound over-approximation on the source text (comments and other uses of the words
count too, core's own modules don't): a field can only be set by writing its name, unless the
name is built at run time (`{ ['sta' + 'tes']: f }`). Then the slot stays empty and the
feature degrades as on a browser without it (ADR 0003 tier 1: no transition, the microtask
lane, no custom states), and development builds warn at `define()`. Saves about 0.27 KiB gzip
in apps that use none of the three. Client-only builds use the same mechanism for the
invoker-command fallback (07 "Client-only builds").

The view layer does the same with values that carry their own commit code (02, 03): `each`,
`raw`, `defineHook` (argument comparison, the client queue) and `defineDisposableHook` (disposal
tracking, view/render/dispose.ts, gyral-c5d.2). A teardown is a function of its own rather than
an option of `defineHook`, so apps whose hooks need none don't bundle the tracking.

Marker drivers carry their own `local` handler (focus, `emit`, store `send`), so their code
comes with the function that builds the command. A host starts its interpreter with its
first command after connecting, not on connect. Each slot is filled before it can be needed:
a component's props, stores and commands are built by those APIs.

## Intent events (gyral-g1r.20)

A host's root listens (capture phase) only for events its intents can fire on: the default
triggers (`click`, `submit`, `input`, `change`, child outputs), `spec.events`, and the
`data-intent-on` values of the templates it renders. `render`/`hydrate` report each template
they instantiate (and `raw()` markup) to the host (`view/render/seen.ts`; one call per run of
instances of the same template); core reads the static `data-intent-on` values from the
template's HTML once per template, and listens for all intent events when the attribute is
bound. A listener is added when its template first renders, before any of its elements can
receive an event. A root that listens for `command` in a browser without invoker commands loads
the fallback (`invokers-shim.ts`, ADR 0003 tier 3); `settled()` waits for it. Client-only
builds carry that `import()` only when a module may use command intents (07 "Client-only
builds").

Effect: 5 listeners per typical host instead of 12 (11 intent events plus the invoker shim's
click listener on every root); keyboard and focus events no longer run intent lookup in
components that don't use them.

## `ElementInternals`

Attached lazily and only once per element, through one internal accessor, when a feature needs
it: custom states today, form association later.

## Registration

- `customElements.define(tag, Class)` unless the tag is already defined; then `define()`
  returns the registered class. Defining the same tag with a different spec warns in
  development.
- In an environment without `HTMLElement` (Node), `define()` records the spec in the server
  registry used by `@gyral/core/server` (06) and returns a placeholder class (it carries `spec`
  and `tagName`; constructing it throws). That check is a few bytes; no export condition is
  needed.
- The registry lives in `view/registry.ts` (so `view/server/` can read it):
  `registerServerComponent(c)`, `serverComponent(tag)`, `serverComponents()`. An entry is
  `{ tag, light, styles (CSS texts), hydrate, render({ attributes, properties, initialMessages?, scope? }) → { view, seed } }`;
  `render` parses props as the browser does, runs `init` (commands dropped) and `initialMessages`,
  and computes the seed (06 "Components"). Core's `server-component.ts` builds it from a spec.
- `scope` (Phase 4) is the nearest provider's scope (opaque to `view/`; `ctx.read` uses it,
  else the request's). Providers register with
  `registerServerProvider({ tag, open(input) → { scope, attributes } })` /
  `serverProvider(tag)`: `<gyral-stores>` is one (06).
- The server renderer takes the host attribute names (`SEED_ATTRIBUTE`, `LIGHT_ATTRIBUTE`,
  `ISLAND_ATTRIBUTE`) from `view/attributes.ts`; a test checks they match the client's.
  `@gyral/core/server` calls `registerRecordedSpecs()` before each render; it registers only
  specs not registered yet.

## Native primitives

| Need                   | Primitive                                                    | Baseline                              |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------- |
| Element                | autonomous custom elements, `observedAttributes`             | widely                                |
| Root                   | `attachShadow`, declarative shadow roots (`this.shadowRoot`) | widely (DSD since 2026-08)            |
| Moves without teardown | `connectedMoveCallback` with `moveBefore()`                  | not Baseline: harmless where missing  |
| States                 | `attachInternals()`, `CustomStateSet`                        | widely; states newly (widely 2026-11) |
| Props                  | Standard Schema (a spec, not a browser API)                  | —                                     |

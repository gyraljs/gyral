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
is reported like a schema issue (`failed isFilter`, the guard's name).

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
- **Production bundles (gyral-c5d.14, 0.3.1):** property sets and seeds don't go through the
  prop machinery at all in production (the element keeps the value as given), so its property
  path stays out of production bundles. The Vite preset also replaces the check of
  `prop.value(check)` (a property-only prop, whose check can't run in production) with
  `void 0` in production client builds when the check is a plain reference (`prop.value(Settings)`,
  `schemas.settings`) or an inline function, so the check and whatever only it uses (a schema
  module) can tree-shake (`compiler/prop-schemas.ts`). The bundler decides: Rolldown (Vite
  8.3) keeps schema builders in a lazily loaded chunk once the schema library sits in a chunk
  shared with the entry, even builders marked `/* @__NO_SIDE_EFFECTS__ */` (seen in
  gyral-shop: valibot used by the entry, an unused `v.array(v.object(…))` kept in a lazy
  chunk). So the saving applies to single-chunk builds and to schemas whose library isn't
  shared across chunks; it is a bundler limitation the pass can't work around. A call
  (`prop.value(v.array(Item))`) is kept: evaluating it could have effects, and the build never
  changes what runs. To drop such a schema, declare it once (`const Items = v.array(Item)`)
  with a library whose builders are marked side-effect free, and pass `prop.value(Items)`.
  `prop.json` keeps its check (attributes are parsed through it), and so do development builds.
- No property-to-attribute reflection. State that CSS needs goes through custom states
  (`spec.states`).

### Prop equality (gyral-dyn.27, 0.3.1)

Every builder gives its prop an `equals(old, new)`; a write (property set, attribute change)
that `equals` accepts is dropped: no invalidation, so no render and no `PropsChanged`.

| Builder                       | `equals`                                               |
| ----------------------------- | ------------------------------------------------------ |
| `string`, `number`, `boolean` | `Object.is`                                            |
| `json`                        | the same `JSON.stringify` text (it is JSON data)       |
| `value`                       | `Object.is`, or the `equals` option (sees `undefined`) |

Why: binding `.prop=${{…}}` with a fresh object each render fired `PropsChanged` (and a child
render) every time, and components added their own syncing. `prop.json` values are JSON by
definition, so equal text is equal data; key order differing only costs an extra render.
`prop.value` holds anything (class instances, functions, nodes), so it keeps identity unless
told otherwise. `equals` lives on the prop (set by the builder in prop.ts), so the element's
write is one call and apps without props pay nothing for it. Decided by the
user on 2026-10-08. Tests: `packages/core/test/prop-equals.test.ts`.

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
preset) `spec-features-used.ts` is a set of empty slots. The template compiler scans the
client build's modules that can affect Gyral components (`compiler/features.ts`), and adds
`import "virtual:gyral-use/<feature>"` at the end of each module that names a field: that
side-effect module calls `register()` in core's `use-transitions.ts`, `use-frame-lane.ts` or
`use-states.ts`, which fills the slot before the naming module runs (imports run first).

- **Which modules** (`compiler/scope.ts`): every module outside `node_modules` (the app's own
  source, workspace and `link:` packages), and the modules of installed packages that are
  Gyral packages (`@gyral/*`) or list one in `dependencies`, `peerDependencies` or
  `optionalDependencies`, directly or through their own dependencies (a design system, a
  library built on one). Any other package (effect, three, a date library) can't import
  `define` or `html`, so it can't define a component or write a spec, and isn't read: its
  comments and identifiers cost nothing. Core's own modules are skipped (they implement it).
- **What counts** (`compiler/facts.ts`, on the module's AST from Rolldown's parser, before
  other transforms): the field's name as an identifier anywhere in runtime code (a property
  key, `spec.states = f`, `{ states }`, an exported binding a namespace import may spread),
  or a string that is exactly the name (`Object.defineProperty(spec, 'states', …)`). Comments,
  type-only code and longer strings ("binding states") don't count. A module that doesn't
  parse is matched on its text.

The scan over-approximates, so it is sound except for two gaps: a name built at run time
(`{ ['sta' + 'tes']: f }`), and spec data written in an installed package that reaches no
Gyral package (declare `@gyral/core` as a peer dependency of such a package). Then the slot
stays empty and the feature degrades as on a browser without it (ADR 0003 tier 1: no
transition, the microtask lane, no custom states), and development builds warn at `define()`.
A false positive only bundles the feature. Saves about 0.27 KiB gzip in apps that use none of
the three. Client-only builds use the same mechanism for the invoker-command fallback (07
"Client-only builds").

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

## Per-event intents (gyral-dyn.15, 0.3.1)

An element may name an intent per event type: `data-intent-<type>=${i.Msg}`. For an event of
type T, each element on the event's composed path (nearest first, within the host as before)
is asked for `data-intent-T` first, then for its plain `data-intent` if T is one of its
triggers (`data-intent-on` or the default trigger); the first element with either answers.
The intent's name is that attribute's value (`IntentInput.name`). `data-intent-on` is reserved:
it is the trigger list, never a per-event attribute.

Why: an element in a sortable list had several events with different meanings (pointerdown
to grab, pointerup to drop, keydown to move, focusin), and one `data-intent` per element forced a
stack of wrapper elements, or one message whose parser branched on `event.type`. The event
list (below) stays for the one-message case. Decided by the user on 2026-10-08.

Listening: the root listens for the event type in each `data-intent-<type>` name its templates
render, bound or static (bound attributes' names come from the template's parts, static ones
from its HTML, `raw()` markup included). Attribute names are lower-cased by the HTML parser, so
per-event names are written in lower case. The compiler's client-only scan counts a
`data-intent-command` attribute as a command intent (07 "Client-only builds"); the ESLint rule
`gyral/unused-intent` counts per-event values as uses (09 "Warnings").

Cost: per-event lookup is one `getAttribute` per element on the path. With the lookup folded
into `readIntent` and `newState` read structurally, core stays the same size (counter:
11 008 → 11 006 B gzip, `pnpm size counter`). Tests:
`packages/core/test/per-event-intents.test.ts` (priority, an `each` row, nesting, `raw()`,
the event scan).

## Declining (gyral-dyn.25, 0.3.1)

A parser that returns `undefined` synchronously declines: `handleIntent` continues the same
walk outward from the element whose parser declined (`readIntent(event, root, after)`), so the
next element on the path with an intent for that event type answers, up to the host's root. A
parser that returns a promise has taken the event, whatever it resolves to (the walk can't
wait). A missing parser still warns and ends the walk. Each component walks only its own tree,
so declining never reaches a parent's intents through the child's lookup; the parent's own
capture listener sees the event as before.

Why: containers with keyboard shortcuts (a toolbar, a grid, a listbox around inputs) need
keys the inner control doesn't handle. Before, the nearest intent took the event even when its
parser returned `undefined`, so a container intent never saw keys from an inner element with
its own `keydown` intent, and code filtered with `event.composedPath()` instead. Behavior change:
an outer intent can now receive events an inner parser ignored. Decided by the user on
2026-10-08. Tests: `packages/core/test/intent-decline.test.ts`.

## Press and release (gyral-dyn.13, 0.3.1)

`data-intent-on` takes a list of event types separated by whitespace. An element's intent
fires for each type in the list (or for its default trigger when it has none), the root
listens for every listed type (the static scan splits quoted lists), and the parser tells them
apart with `input.event.type`. That makes a press-and-hold control (push to talk) one intent
and one message (`Talk { down }`), where apps wrote `pointerdown`/`pointerup`/`pointercancel`
and `keydown`/`keyup` listeners by hand. The client-only scan
counts `command` anywhere in a quoted list (07 "Client-only builds").

A release must arrive even when the pointer leaves the element first. That is pointer
capture, provided by the `capturePointer()` element hook (02 "Element hooks"): it calls
`setPointerCapture(pointerId)` on `pointerdown`. It is a hook rather than automatic for lists
naming `pointerdown` and `pointerup` because built in it cost every app about 35 B gzip; as a
hook only apps that use it bundle it, and the capture is visible in the markup. List support
itself costs about 25 B. Capture is not set for synthetic events (the pointer isn't active:
the call throws and is ignored).

Two consequences parsers must know (gyral-dyn.16):

- `input.target` is the intent element. `event.currentTarget` is the root Gyral delegates from
  (the shadow root, or the host for light-DOM components), and `event.target` is the hit
  element inside the intent element.
- While an element holds pointer capture, the browser targets that pointer's events at it.
  `capturePointer()` captures on the intent element, so its own intents keep firing, but
  intents on elements inside a capturing ancestor stop firing until release: their events
  are retargeted to the ancestor, and the lookup starts there.

Tests: `packages/core/test/press-release.test.ts` (a real
pointer released outside the button, `pointercancel`, `lostpointercapture`, key repeat).

## Intent names (gyral-dyn.12, 0.3.1)

The runtime looks a parser up by the `data-intent` (or `data-intent-<event>`) value and
dispatches what it returns; it never checks the name against the message union. Which names
exist is a type-level rule (ADR 0001 "Intent names"): a message tag, whose parser returns that
variant, or a name declared with `IntentName<…>` in the union, whose parser may return any
message and which has no reducer. Both appear in the view's `i` and in `intents<Msg>()`, so
markup and rows name them the same way, and an unknown name fails to compile.

## Focus (gyral-dyn.26, 0.3.1)

`shadow: { delegatesFocus: true }` in the spec attaches the shadow root with that option, and
the server writes `shadowrootdelegatesfocus` on the declarative shadow root, so a hydrated host
has the same root. Focusing the host (`el.focus()`, a parent's `focus('my-field')` command, a
click on a non-focusable part) focuses its first focusable element, and `:focus` matches the
host while focus is inside it. `shadow` stays `true` by default and `false` for light DOM; the
object form is a shadow root with options, spread into `attachShadow` before `mode: 'open'`,
which costs a few bytes and no new spec key.

Why: `focus()` commands query the component's own root, so a parent can't name an element
inside a child's shadow root; delegation lets it name the child instead, with no new API.

Focus also survives re-renders only as long as the focused node does. A node the view stops
rendering takes focus with it (the browser moves focus to the body), so keep focusable rows in
a keyed `each` (a row moves, it isn't recreated) and return a `focus()` command when the focused
item really goes away (a deleted row: focus its neighbour or the list). Tests:
`packages/core/test/delegates-focus.test.ts`, `test/view/server-components.node.test.ts`.

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

| Need                   | Primitive                                                      | Baseline                              |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------- |
| Element                | autonomous custom elements, `observedAttributes`               | widely                                |
| Root                   | `attachShadow`, declarative shadow roots (`this.shadowRoot`)   | widely (DSD since 2026-08)            |
| Focus delegation       | `attachShadow({ delegatesFocus })`, `shadowrootdelegatesfocus` | widely (the attribute with DSD)       |
| Moves without teardown | `connectedMoveCallback` with `moveBefore()`                    | not Baseline: harmless where missing  |
| States                 | `attachInternals()`, `CustomStateSet`                          | widely; states newly (widely 2026-11) |
| Props                  | Standard Schema (a spec, not a browser API)                    | —                                     |

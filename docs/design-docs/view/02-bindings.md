# 02 — Bindings

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018. Phase 2.

Gyral views are pure functions of state: no closures, no listeners. That fixes the binding
surface to what views actually use. There are **no event bindings**: intents are plain
`data-intent` attributes, read by core's delegated listener (ADR 0001).

## Hole kinds

| Kind            | Written as                              | Example                                   |
| --------------- | --------------------------------------- | ----------------------------------------- |
| child           | `${v}` between tags                     | `<p>Hello ${name}!</p>`                   |
| child (sole)    | `${v}` as an element's only content     | `<td>${row.id}</td>`                      |
| attribute       | `name=${v}`                             | `href=${url}`, `data-intent=${i.Save}`    |
| multi-attribute | `name="a ${v} b"` (quoted)              | `class="btn ${s.kind}"`                   |
| boolean         | `?name=${v}`                            | `?disabled=${s.busy}`                     |
| property        | `.name=${v}`                            | `.items=${s.items}` (on Gyral components) |
| hook            | `${hook(…)}` inside a start tag         | `<input ${invalid(errors)}>`              |
| text content    | `${v}` inside `<textarea>` or `<title>` | `<textarea>${s.message}</textarea>`       |

Anything else (holes in tag or attribute names, comments, `<script>`, `<style>`) is a build or
first-render error (09).

## Child values

| Value                                   | Renders                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| `string`, `number`                      | A Text node (`String(v)`); updates set `.data` in place       |
| template result                         | An instance; same template as before → its parts update       |
| `svg` template result                   | The same, inside SVG content only (01 "svg templates")        |
| `each(…)` (03), array of child values   | A list; arrays are positional (by index), `each` is keyed     |
| `raw(html)`                             | Parsed markup (below)                                         |
| `null`, `undefined`, `false`, `nothing` | Nothing                                                       |
| `true`                                  | Nothing, plus a development warning (it's a `cond && x` slip) |
| any other object or function            | Development error; nothing in production                      |

`false` renders nothing so `${s.open && html`…`}` works. When the value changes kind (text to
template, template to list), the old content is removed and the new content created. Changing
to a different template replaces the instance.

"The same template" means the same template object, or, where objects carry ids (the runtime
path, development builds), the same id. Production client builds carry none and compare
objects (01 "Template ids", gyral-g1r.22). A call site always yields the same object, so the
difference is only visible for identical markup at call sites in two modules: in production
switching between them replaces the instance (new nodes, focus and edits in it lost) where an
id would have patched it. Acceptable: views that switch between two places usually render
different markup, and a shared view function is one call site.

### The anchor rule

A child part must always know where to insert. It inserts before its **reference node**:

- the next static sibling **element or comment** in the template, if there is one (static
  nodes never move);
- otherwise the end of the parent (`null`), if the hole is its parent's last child;
- otherwise an **anchor**: an empty comment `<!---->` emitted after the hole in the template
  HTML. That happens only when the hole is followed by static text or by another child hole.

A hole at a template's root whose `ref` is `null` means "the end of the instance": the instance's
owner (a parent part, a list, the render root) supplies the position. `sole` only applies inside
templates; the render root never clears with `replaceChildren()` (a shadow root may hold styles).

Sole holes, attribute and hook parts, and list items need no anchor. The benchmark row
(`<td>${id}</td><td><a>${label}</a></td>…`) has none. Anchors are part of the template HTML,
so the server writes exactly the same ones (06), and hydration finds them where it expects (07).
`server` templates (page shells, 01) get none: they are never hydrated.

## Attribute values

**Single** (`name=${v}`):

| Value                          | Effect                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| `string`, `number`             | `setAttribute(name, String(v))`                             |
| `true` / `false`               | `"true"` / `"false"`: ARIA relies on them (`aria-expanded`) |
| `null`, `undefined`, `nothing` | Attribute removed                                           |

No more `?? nothing`: `href=${s.url}` with an undefined URL simply leaves `href` out. For
presence-only attributes use `?name`.

**Attribute names** are written as the HTML parser spells them, so the client sets the same
attribute the server's markup creates: lower case on HTML elements; on SVG elements (inline
`<svg>` in `html`, and `svg` templates) lower case except SVG's camelCase attributes, which take
their SVG spelling whatever the case written (`viewbox=${v}` and `viewBox=${v}` both bind
`viewBox`; WHATWG HTML's "adjust SVG attributes" table, `normalize/svg.ts`). Namespaced
attributes can't be bound: `xlink:href=${v}`, `xml:lang=${v}` and `xmlns…` are rule 10 errors
(09) that point to the plain SVG 2 attribute (`href=${v}`, `lang=${v}`), since the parser puts
them in their own namespace and `setAttribute` can't. Static ones (`xlink:href="#a"`) are fine:
the parser handles them on both sides (0.3.1).

**Multi** (`name="a ${x} b"`): pieces are joined with the static strings. `null`/`undefined`
pieces become `''`; `nothing` in any piece removes the attribute.

Other objects in an attribute warn in development and are written as `String(v)`. Invalid child
values are rejected before any DOM change.

All attribute parts compare the new value (or joined string) with the committed one and write
only on change.

## Boolean attributes

`?name=${v}`: truthy → present (`""`), falsy → absent (`toggleAttribute`). `nothing` counts as
falsy. Names in the form-state table below also drive the live property.

## Properties

`.name=${v}` sets `element[name] = v` when `!Object.is(v, committed)`. Its main use is passing
data props to Gyral components. On the server a property binding on a Gyral component becomes a
prop for that component's render (06). On any other element it is dropped, so form state must
not use property bindings (09, rule 4).

**Functions** (0.3.1, gyral-g1r.28): views attach no closures, so a function value warns in
development, once per part, when a client render commits it (hydration adopts values without
the check: a warning there would keep the code alive in production bundles, which share it
across chunks), and is still set:

- on a built-in element (`.onclick=${fn}`): events are intents (`data-intent=${i.Name}`),
  behaviour on an element is a hook;
- on a Gyral component: props are data. They travel in hydration seeds (JSON), and a function
  prop is a closure over the parent's view. Pass data and hear back through outputs. No
  exception for a `prop.value` whose guard accepts functions: the seed couldn't carry it;
- not on other custom elements (a dash in the name, not Gyral's): a third-party widget's API
  may take a callback, and that is the author's call.

`@gyral/core/eslint`'s `gyral/template` also reports a function written directly in any hole
(`${() => …}`, `${function () {}}`), which is never right: a child hole can't render it, an
attribute would get its source text, a hook position rejects it (09 "ESLint").

## Live form state

One spelling per piece of form state. The compiler and runtime know this table, which replaces
`live()`, `liveBoolean()` and `textarea()`:

| Element                        | Binding               | Server writes             | Browser does                                                       |
| ------------------------------ | --------------------- | ------------------------- | ------------------------------------------------------------------ |
| `<input>` (text-like types)    | `value=${v}`          | `value="…"`               | first creation: attribute and `.value`; later: `.value` only       |
| `<input type=checkbox\|radio>` | `?checked=${v}`       | `checked` present/absent  | first creation: attribute and `.checked`; later: `.checked` only   |
| `<input type=checkbox>`        | `?indeterminate=${v}` | nothing (no attribute)    | `.indeterminate`                                                   |
| `<textarea>`                   | `${v}` as content     | escaped text content      | first creation: text content; later: `.value` only                 |
| `<option>`                     | `?selected=${v}`      | `selected` present/absent | first creation: attribute and `.selected`; later: `.selected` only |
| `<details>`, `<dialog>`        | `?open=${v}`          | `open` present/absent     | the `open` attribute (it is the state)                             |

- **Live** (rule, 2026-10-06): like every part, a form-state part writes only when the model's
  value for it changed since its last commit (`===` on the value, on its truthiness for
  `?name`, on the flattened text for `<textarea>`). When it does write, it compares with the
  element's **live** state (`.value`, `.checked`, `.selected`, `.indeterminate`, the `open`
  attribute) and writes only if they differ. So the model wins whenever it changes, even after
  the user has edited the control, and a render whose model value for that part is unchanged
  (any other message, a refused edit) never touches the control: what the user typed or
  toggled stays. A change undone before the render (two messages in one flush) is no change.
- Setting the attribute on first creation keeps `form.reset()` meaningful (it resets to the
  model's initial value), matching server-rendered markup.
- Hydration is the same rule: adopted parts take the model's (the seed's) values as committed,
  so state the user changed before scripts ran stays until the model's value changes (07).
- **Text-like** inputs are every `<input>` type except checkbox, radio, hidden, button, submit,
  reset, image and file. A missing value means `''` and writes no attribute on first creation.
- `?open` compares with the attribute's live presence. `<textarea>`/`<title>` content follows the
  child-hole value rules, flattened to a string.
- A checkbox's `value`, `<button value>`, `<option value>` and the like are submitted values,
  not state: plain attributes.

### Putting a control back

A refused edit stays in the control: the model didn't change, so nothing is written. To show
the model's value again, change the model:

- **Clamp or normalize** to a value that differs from the committed one (a capped number
  stored as the cap, a trimmed string), and the part writes it.
- **Re-create the controls with a key**: keep a counter in the model, bump it on reset, and
  render the form as a keyed row, `${each([s], (x) => x.formKey, (x) => fields(x))}`. A new
  key replaces the form's elements with fresh ones carrying the model's values (focus is lost
  with them; a `focus(selector)` command puts it back). `form.reset()` is not a substitute: it
  restores the first values (the attributes), not the model's.

Tested in `core/test/form-edits-hydration.test.ts` (both builds) and
`core/test/view/render-form.test.ts`.

## Element hooks

A hook position also accepts `null`, `undefined` and `nothing` (no hook); anything else that
isn't a hook result is a development error.

The replacement for element directives: small behaviours attached to the element they sit on.

```ts
export const invalid = defineHook<[errors?: readonly string[] | string]>({
  server: ([errors]) => (hasErrors(errors) ? { 'aria-invalid': 'true' } : {}),
  client: (el, [errors], prev) => {
    /* setCustomValidity, aria-invalid, clear-on-edit */
  },
});
```

- `server(args)` (optional) returns attributes to add to the element's start tag (`true` means
  present without a value). This removes the double-written `aria-invalid` in apps today.
- `client(el, args, prev)` runs after the instance's parts have committed, when `args` differ
  from the previous call (shallow `Object.is` per argument). `prev` is `undefined` on the first
  call. During hydration it runs once with the hydrated args (07).
- `dispose(el, args)` (0.3.1, gyral-c5d.2) is the teardown, with the last arguments `client`
  got, for hooks defined with `defineDisposableHook` (`defineHook` takes none: a development
  error). See "Widgets with a lifecycle" below.
- Hooks may only act on their own element. Listeners they add to it are collected with it, so
  a hook that only listens needs no `dispose`.
- Core ships `invalid` and `labelledBy` as hooks.

### Widgets with a lifecycle

Something with setup and teardown (a WebGL or Three.js stage, a chart library, a map, an
observer, a timer, a connection) has a native home: **a custom element of its own**. Give it
one property for its input (`<my-stage .view=${s.scene}>`), keep its state inside, set up in
`connectedCallback`, tear down in `disconnectedCallback`, and report back with events (a Gyral
component, or any custom element dispatching `OUTPUT_EVENT`, ADR 0010). The platform then tells
it about every connect, disconnect and move, the view stays a pure description, and the
widget can be tested on its own. A Gyral component works for it too (`prop.value` for the
input, `outputs<Out>()` for its events), and so does a plain `HTMLElement` subclass when its
work is all imperative.

For **small imperative behaviours** on an element of the view (scrolling it into view,
observing its size, a third-party enhancer on one input), a hook with a teardown,
`defineDisposableHook`, is the lighter option:

```ts
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Highlights the element for a moment whenever `value` changes. */
export const flash = defineDisposableHook<[value: unknown]>({
  client: (el, _args, prev) => {
    if (prev === undefined) return; // not on first render
    el.classList.add('flash');
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => el.classList.remove('flash'), 600),
    );
  },
  dispose: (el) => {
    clearTimeout(timers.get(el));
  },
});
```

- **When:** `dispose` runs when the element leaves its render root (Gyral removed it: its part
  cleared, its instance replaced by another template or by text, its `each` row or array item
  removed, its list emptied), when the position stops holding the hook (`nothing`, or another
  hook, whose `client` then starts with `prev` undefined), and when the host disconnects. It
  never runs for moves: rows reordered within a list, or a host moved with `moveBefore()`
  (`connectedMoveCallback`).
- **Timing:** removal is noticed after the render's commit (the element has left the DOM),
  before that render's `client` calls; a disconnect disposes in `disconnectedCallback`.
- **Reconnect:** after a host disconnects and reconnects (a plain move without `moveBefore`, or
  re-inserting it later), the host renders, and each hook disposed by the disconnect runs
  `client` again with `prev` undefined, with its current arguments.
- **How:** a disposable hook is tracked per render root from its commit, with the spec and
  arguments to dispose (`render/dispose.ts`). After each render of a root commits, every
  tracked hook whose element is no longer inside the root (`root.contains`), or whose position
  holds something else, is disposed. Moves keep elements inside the root, so nothing else is
  needed to tell a move from a removal.
- **Cost (measured 2026-10-07, gzip):** the tracking comes with `defineDisposableHook` (05
  "Features register themselves"), a function of its own rather than an option of
  `defineHook` (owner decision, gyral-c5d.2 option B): an app that calls only `defineHook` (or
  only uses `invalid`/`labelledBy`) doesn't bundle it. Every app: about 20 B (a check per render
  and per disconnect). Apps that call `defineDisposableHook`: about 0.25 KiB more, which runs
  only once such a hook has committed. Hooks without `dispose` pay no run-time cost.
- Tested in `core/test/view/render-hooks-dispose.test.ts`.

## `raw(html)`

- Child position only. The string is trusted markup from your own code (Markdown output, JSON-LD
  scripts). Never pass user input.
- Server: written verbatim, preceded by an anchor comment, so hydration knows where it starts.
- Browser: parsed with a `<template>` (`innerHTML`) and inserted after the same start anchor,
  only when the string changes.
- A `raw()` value in a component that renders in the browser is a development warning (09):
  every change re-parses it.
- Like `each` (03), its result carries the code that commits it: apps that never call `raw`
  don't bundle it. Hook results do the same (`defineHook`, render/hook-part.ts): argument
  comparison and queueing come with the first hook an app defines, and disposal tracking with
  the first `defineDisposableHook` (render/dispose.ts).

## `nothing`

A shared sentinel exported by core. In a child hole it renders nothing; in an attribute it
removes the attribute (also in a multi-attribute).

## Commit order

- Parts commit in document order. On first render an instance's parts commit **before** the
  instance is inserted, so a child component connects with its props already set.
- After commit, disposable hooks whose element left the root (or whose position changed) are
  disposed, then hooks run `client` (in document order), then the scheduler's post-render work
  (04).

## Native primitives

| Need       | Primitive                                                                                            | Baseline                       |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| Text       | `Text.data`                                                                                          | widely                         |
| Attributes | `setAttribute`, `removeAttribute`, `toggleAttribute`                                                 | widely                         |
| Insertion  | `insertBefore` / `before`, `DocumentFragment`                                                        | widely                         |
| Form state | `.value`, `.checked`, `.selected`, `.indeterminate`, `defaultValue`/`defaultChecked`, `form.reset()` | widely                         |
| Raw markup | `<template>` + `innerHTML`; Sanitizer API later                                                      | widely; Sanitizer not Baseline |

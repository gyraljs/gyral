# 02 — Bindings

Status: **accepted** (2026-10-06). ADR 0018. Phase 2.

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

Tested in `core/test/form-edits-hydration.test.ts` (both builds) and `render-form.test.ts`.

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
- Hooks may only act on their own element. Listeners they add to it are collected with it, so
  there is no disconnection tracking and no cleanup callback.
- Core ships `invalid` and `labelledBy` as hooks.

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
  comparison and queueing come with the first hook an app defines.

## `nothing`

A shared sentinel exported by core. In a child hole it renders nothing; in an attribute it
removes the attribute (also in a multi-attribute).

## Commit order

- Parts commit in document order. On first render an instance's parts commit **before** the
  instance is inserted, so a child component connects with its props already set.
- After commit, hooks run (in document order), then the scheduler's post-render work (04).

## Native primitives

| Need       | Primitive                                                                                            | Baseline                       |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| Text       | `Text.data`                                                                                          | widely                         |
| Attributes | `setAttribute`, `removeAttribute`, `toggleAttribute`                                                 | widely                         |
| Insertion  | `insertBefore` / `before`, `DocumentFragment`                                                        | widely                         |
| Form state | `.value`, `.checked`, `.selected`, `.indeterminate`, `defaultValue`/`defaultChecked`, `form.reset()` | widely                         |
| Raw markup | `<template>` + `innerHTML`; Sanitizer API later                                                      | widely; Sanitizer not Baseline |

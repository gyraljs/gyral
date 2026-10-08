# ADR 0001 — MVI with parsed intent

Status: **accepted** (2026-10-04)

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): the view is a Gyral `html` template, not a Lit template. Lit-specific text below describes 0.2.x.

## Context

Cycle.js's Model-View-Intent kept intent, model and view separate, which made apps easy to
test. But intent selected DOM nodes with CSS-class strings (`DOM.select('.inc')`), and every
concern (events and state alike) was a stream. That made Cycle hard to learn. We looked at:

| Option                                         | Verdict                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Classic MVI (`intent(sources) → model → view`) | Faithful, but needs selector strings or stream plumbing                         |
| Elm-style (`send()` closures in the view)      | Easy to use, but intent leaks into the view as closures                         |
| **Parsed intent**                              | **Chosen.** Keeps MVI's separation; uses semantic HTML as the source of intents |
| Signals-only (Solid-style)                     | Rejected: no pure, testable core                                                |

## Decision

A component is `define(tag, { props?, init, intent, update, view, styles? })`:

- **Messages** are a tagged union (`{ _tag: 'Add', text }`). A message's tag is also its
  intent name.
- **View** is `` (state, i) => html`…` ``. It names intents in markup: `data-intent=${i.Add}`.
  `i` is typed, so a typo in an intent name is a compile error. Views attach no closures.
- **Intent** maps tags to parsers: `(IntentInput) => Message | undefined`. `IntentInput` holds
  the event, the element, `value`, `checked`, and `FormData` for form submissions. Returning
  `undefined` ignores the event. Parsers are where "parse, don't validate" happens for UI
  input; Standard Schema helpers come with gyral-czi.3.
- **Triggers:** `<form>` → `submit` (default prevented); text inputs and `<textarea>` → `input`;
  checkbox, radio and `<select>` → `change`; anything else → `click`. Override with
  `data-intent-on="…"`.
- **Isolation:** only `data-intent` elements in the component's _own_ shadow root count.
  Shadow DOM replaces Cycle's `isolate()`.
- **Model** is a record of reducers keyed by tag, so the types force it to be exhaustive. In
  v0 a reducer returns state. Returning `[state, effects]` arrives with gyral-czi.2.
- Messages from drivers (for example `HttpFailed`) have reducers but no intent parser.
- `Component.spec` is exposed so tests can call `update` without a DOM.

## Consequences

- Intent names appear in markup as message tags (PascalCase).
- Component state lives in the element (a private model field, then `requestUpdate()`).
  Shared app state across components will use signals (`@lit-labs/signals`). That is a
  separate decision, to be recorded when a shared-state bead needs it.
- Escape hatches: `el.send(msg)` for imperative sources (canvas, observers). Raw Lit is
  always allowed.
- Invoker commands (`command="--x"`) become a progressive intent source later (gyral-czi.6).
  They are not part of the baseline (ADR 0003).

## Addendum: more trigger events (gyral-czi.16, 2026-10-04)

Intent listeners run in the **capture phase** on the shadow root, so non-bubbling events reach
it too. Beyond the default triggers (click, submit, input, change, child outputs), these fire
through `data-intent-on`: `keydown`, `keyup`, `focusin`, `focusout`, `toggle`. A component can
add others with `spec.events` (for example `['pointerdown']`). `IntentInput` gains `key`
(keyboard events) and `newState` (`toggle` on popovers and `<details>`). An element carries one
`data-intent`, so a second intent on the same control goes on an ancestor (for example a
`keydown` intent on the wrapper of an input whose `input` intent is on the input itself).
Parsers may call `event.preventDefault()` to cancel default input handling (arrow keys moving
the caret); they must not do other side effects.

**Update (gyral-g1r.20, 2026-10-06):** a component root no longer listens for every intent
event. It listens for the default triggers, `spec.events`, and the `data-intent-on` values in
the templates it renders, added when a template first renders (all intent events when a
template binds `data-intent-on` dynamically). Any statically named event type now works
without `spec.events`; list a type there only when a bound `data-intent-on` produces it and it
isn't one of the intent events above. Details: view/05-element.md "Intent events".

**Update (gyral-dyn.13, 2026-10-08, 0.3.1):** `data-intent-on` takes a list of events
(`"pointerdown pointerup pointercancel"`, `"keydown keyup"`), so press and release are one
intent whose parser reads `event.type`; the `capturePointer()` hook keeps the pointer on the
element until release. Intent names stay message tags: several controls that change one thing
share one intent and say which they are through `name` (the skill's intent.md "Several
controls, one message"). Details: view/05-element.md "Press and
release".

**Update (gyral-dyn.15 and gyral-dyn.17, 2026-10-08, 0.3.1; decided by the user):** an element
may name an intent per event type, `data-intent-<event>=${i.Msg}`, which comes before its plain
`data-intent` for that event (view/05-element.md "Per-event intents"). Parsers receive the
read-only `Ctx` reducers get as a second argument, `(input, ctx)`: props as they are when the
event fires (read from the element, not from the last render) and `read(store)`, so a parser
can decide synchronously, from props, whether to `preventDefault()` (a listbox whose
orientation prop says which arrow keys it owns). Parsers stay pure apart from `preventDefault()`. `IntentParser<M, P>` types it;
one-parameter parsers still fit, and `form()`/`field()`/`child()` return one-parameter
parsers so existing direct calls still compile.

## Addendum: View Transitions (gyral-czi.12, 2026-10-04)

`spec.viewTransition?: (prev, next, msg) => boolean` decides, per state change, whether the
render happens inside `document.startViewTransition`. It is a pure predicate over state, so the
model still owns "what changed"; CSS (`::view-transition-*`) owns how it looks. It is an ADR
0003 enhancement: skipped without the API or when `prefers-reduced-motion: reduce` matches.
`settled()` (before it, `updateComplete`) waits for the transition's update callback, so callers
and tests see the new DOM. A transition skipped by a newer one still runs its update (per spec).

## Addendum: model state as CSS custom states (gyral-czi.4, 2026-10-04)

`spec.states?: (s) => Record<string, boolean>` mirrors boolean facts about the state onto
`ElementInternals.states` after each render, so styles react to the model without classes:
`:host(:state(loading))` inside, `gy-x:state(loading)` outside. ElementInternals is attached
only when a spec declares `states` (it can be attached once; form-associated components may
need it). Feature-detected (ADR 0003); never on the server. Accessibility state still belongs
in ARIA attributes (`aria-busy`); custom states are for styling.

## Addendum: styles as strings and stylesheets (gyral-czi.24, 2026-10-04)

`spec.styles` accepts `Styles`: `css` templates, plain CSS strings, `CSSStyleSheet` instances,
or arrays of them (nested freely). Strings let an app keep one stylesheet module and use it in
both the document and shadow roots without wrapping it in `unsafeCSS` itself; they must be
trusted CSS from the app's own code, never user input. A constructed `CSSStyleSheet` is adopted
as-is, so one instance can be shared by many components.

## Addendum: accessible names across shadow roots (gyral-czi.26, 2026-10-04)

IDREF attributes such as `aria-labelledby` can't cross a shadow boundary, so a `<form>` or
landmark inside a component can't point at the page's `<h1>`. The pattern:

```ts
props: { label: { type: String, required: true } },
view: (s, i, { props }) => html`
  <form aria-label=${props.label} ${labelledBy('page-title')} data-intent=${i.Submit}>…</form>`,
```

- Always render a plain `aria-label` from a `label` prop. It is server-rendered, so the no-JS page
  is named too.
- Add `labelledBy(id, fallback?)` to follow a visible heading. It resolves the id from the
  element's own root outward to the document. Where ARIA element reflection exists
  (`ariaLabelledByElements`, newly available Baseline, feature-detected) it links the element
  itself, and `aria-labelledby` then wins over `aria-label`. Elsewhere it sets `aria-label` to
  `fallback` or the heading's text. It retries once if the heading renders after the component.
- Prefer a visible `<label>`/`<legend>` inside the component when the component owns the text.

## Addendum: invoker commands as an intent source (gyral-czi.6, 2026-10-04)

An element with `data-intent-on="command"` receives intents for invoker commands aimed at it
(`<button commandfor="list" command="--add">`). `IntentInput.command` carries `{ command,
source }`. Browsers with invoker commands dispatch a native `CommandEvent` on the target. Since
invokers are Baseline newly available, not widely (ADR 0003), Gyral's intent wiring also
listens for clicks on custom-command (`--…`) invokers and, only when `CommandEvent` is missing,
dispatches an equivalent `command` event (with the native event's `command` and `source`
properties since gyral-g1r.18; it loads lazily, ADR 0003 tier 3) on the `commandfor` target, so the same markup
works everywhere. Built-in commands (`show-modal`, `toggle-popover`, …) are left to the browser.
`invokersSupported()` is exported. Example: `examples/invoker-commands`.

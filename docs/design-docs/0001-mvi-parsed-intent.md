# ADR 0001 — MVI with parsed intent

Status: **accepted** (2026-10-04)

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
- **View** is `(state, i) => html\`…\``. It names intents in markup: `data-intent=${i.Add}`.
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

## Addendum: View Transitions (gyral-czi.12, 2026-10-04)

`spec.viewTransition?: (prev, next, msg) => boolean` decides, per state change, whether the
render happens inside `document.startViewTransition`. It is a pure predicate over state, so the
model still owns "what changed"; CSS (`::view-transition-*`) owns how it looks. It is an ADR
0003 enhancement: skipped without the API or when `prefers-reduced-motion: reduce` matches.
`updateComplete` waits for the transition's update callback, so callers and tests see the new
DOM. A transition skipped by a newer one still runs its update (per spec).

## Addendum: model state as CSS custom states (gyral-czi.4, 2026-10-04)

`spec.states?: (s) => Record<string, boolean>` mirrors boolean facts about the state onto
`ElementInternals.states` after each render, so styles react to the model without classes:
`:host(:state(loading))` inside, `gy-x:state(loading)` outside. ElementInternals is attached
only when a spec declares `states` (it can be attached once; form-associated components may
need it). Feature-detected (ADR 0003); never on the server. Accessibility state still belongs
in ARIA attributes (`aria-busy`); custom states are for styling.

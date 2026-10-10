# ADR 0025: Declarative subscriptions

Status: **accepted** (2026-10-09, owner decision O1 of the 0.3.1 surface review). Bead:
gyral-1zd.19. Changes ADR 0006 (effects), view/05 "Lifecycle", and removes the `Connected`
framework message added in 0.3.1-next.5 (gyral-dyn.33).

## Context

Long-lived effects (polling, clocks, sockets, store and media-query watches) were imperative:
a component started them from `init` or a reducer, restarted them on `PropsChanged`, re-issued
them on `Connected` after a real detach, and stopped them with lane tricks (a no-op driver that
takes over the lane). Each watch was written three times. Across the audited apps:

- one app patched `customElements.define` (79 lines plus a lint rule) and wrote 19
  `Reconnected` reducers; about 40% of its polling code was re-attach logic;
- another started and stopped a clock by diffing state in a reducer;
- the examples hand-wrote abort handling in three streaming drivers;
- **no project handled `Connected`**, the message meant to cover re-attach.

How others do it:

| Framework            | Mechanism                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Elm, Hyperapp        | `subscriptions : Model -> Sub Msg`, diffed by the runtime after every update               |
| React, Preact        | `useEffect(fn, deps)` with cleanup; the deps array decides restarts                        |
| Svelte 5, Solid, Vue | `$effect`, `createEffect` + `onCleanup`, `watchEffect`: re-run when what they read changes |
| Qwik                 | `useTask$`/`useVisibleTask$` with `track()`                                                |
| Lit                  | Reactive controllers (`hostConnected`/`hostDisconnected`), imperative                      |
| htmx                 | `hx-trigger="every 30s"`, declarative polling in markup                                    |

Almost every framework derives what runs from state. Gyral's effects are already data
(commands), which is Elm's half of the model; subscriptions are the other half.

## Decision

A spec field:

```ts
subscriptions?: (state: S, props: P) => readonly Command<M>[];
```

It lists the long-lived commands that should be running now. The runtime keeps the running set
equal to it.

**When it is evaluated:** after the host's first render, then after every update and every
props change while the host is connected (a props change counts even without a `PropsChanged`
reducer). Starting after the first render matches init's commands on a server-rendered host:
nothing a subscription emits can change the state hydration adopts.

**Diff rules,** by lane (the command's `key`, else its driver's name):

| Before           | Now              | Effect            |
| ---------------- | ---------------- | ----------------- |
| absent           | present          | start             |
| present          | absent           | abort             |
| present, input A | present, input B | abort, then start |
| present, input A | present, input A | keep running      |

Inputs are compared by their JSON text, so a fresh but equal object doesn't restart anything.
Functions inside an input count as equal (an inline selector such as `watch(store, (s) => s.x)`
is a new function after every message), repeated objects and cycles are cut, and BigInts are
written out (gyral-1zd.29; first shipped comparing functions and cyclic values by identity, which
restarted such lanes on every message until G0080 stopped them). To restart on a new selector,
change the key. Two
commands in one result with the same lane: the first runs and development warns (G0079); give
each its own `key`. A subscription that ends by itself stays ended until its lane or input
changes. A sync that keeps triggering itself (an input that changes with every message the
subscription sends) stops after 100 rounds and is reported (G0080).

**Lifecycle.** Subscriptions stop with the host's other commands: one microtask after a real
removal, never on a move (ADR 0006, 05 "Lifecycle"). When a stopped host is attached again, the
set is derived from the current state and started. This replaces the `Connected` message,
which is removed.

**Errors.** A throwing `subscriptions` is reported as an update failure (ADR 0024, G0073 with
the message name `subscriptions`); the running set stays as it was.

**Commands from `init` and reducers** keep working as before: one-shot requests, and anything
that should not follow state.

**`every` replaces `periodic`** in `@gyral/time`: `every(ms, (now) => msg, key?)` sends
`Date.now()` at once and then every `ms` (virtual under `virtualTime()`). A wall-clock time is
what both apps that needed a clock built for themselves; tick counts are derivable from it.

## Interactions

- **`settled()`** is unchanged: it waits for quiet turns, not for long-lived commands to end.
- **Hydration:** subscriptions start after the hydrating render (above).
- **Stores:** `subscriptions` sees state and props; a store-driven restart goes through a
  `StoreChanged` reducer that copies what matters into state.
- **Devtools:** subscription commands are ordinary commands in the timeline.
- **Tests:** `subscriptionsFor(spec, state, props)` in `@gyral/testing` returns the commands
  for a state, without a DOM; assert their inputs with `inputsFor`.

## Size

A spec-field feature (view/05 "Features register themselves"): the diff lives in
`subscriptions.ts`, which compiled builds include only when a module names the field. Every
app pays for a few calls in the host model and the element; the interpreter gained `cancel()`.

## Consequences

- One rule for long-lived work; restarts on props and re-attach need no code.
- Breaking: `Connected` is gone, and `periodic` is replaced by `every`.
- A lane is shared between subscriptions and other commands: keep subscription keys distinct.

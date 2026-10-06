# 04 — Scheduler and `settled()`

Status: **accepted** (2026-10-06). ADR 0018 (decisions C and H). Phase 3 (with spike gyral-g1r.8).

One global scheduler renders every component. Components don't keep their own promise chains,
update maps or completion promises.

## Marking

- `send(msg)`, intent delivery, driver results, store changes and prop changes all end in
  `markDirty(host)`. Reducers run **immediately**, so `el.state` is always current. Only the
  render waits.
- Marking an already-dirty host does nothing. The first mark in a quiet period schedules a
  flush with `queueMicrotask`.
- Every delivered message marks its host, even when the reducer returns the same state: the
  render's live form-state comparison (02) then writes a refused edit back to the control.
- A host that isn't connected isn't rendered; it renders when it reconnects.
- Each host records its **depth** (number of Gyral host ancestors in the composed tree) when it
  connects. Sorting by depth needs no DOM queries.

## The flush

1. Take the dirty host with the smallest depth (ties: the order they were marked).
2. If its props changed since its last render (`Object.is` per declared prop), run the
   `PropsChanged` reducer first (ADR 0007).
3. Render: call `view(state, intents, ctx)` and commit the result into the host's root (02, 03).
   On first render this is either a fresh render or hydration (07).
4. A render that sets new props on a child marks that child dirty. It is deeper, so it renders
   later in the **same** flush, once, with its final props.
5. Repeat until no host is dirty, then run the **post-render queue** (below). If that marks
   hosts dirty, loop again within the same flush.
6. Resolve waiting `settled()` promises.

**Errors:** a view or reducer that throws is logged with its tag, its previous DOM stays, and the
flush continues with the other hosts. Post-render work that throws is logged the same way.

Outputs a child sends to its parent (`emit`, ADR 0010) are dispatched in a microtask, outside the
child's render; the scheduler counts them as pending work, so `settled()` waits for them and for
the parent render they cause.

**Loop guard:** more than 10 renders of one host, or 100 passes, in one flush means a cycle (two
components feeding each other props or messages). Development throws, naming the tags involved:
waiting `settled()` promises reject with the error, or, when nothing waits, it is thrown from the
flush (an uncaught error). Production logs the same message and drops the remaining work, so the
page doesn't freeze.

## Post-render queue

Everything that must happen after the DOM reflects the new state runs here, in this order, once
per flush:

1. Focus commands (`focus(selector)`), against the host's root.
2. Custom-state sync (`spec.states` → `ElementInternals.states`).
3. `Hydrated` messages for hosts that finished their first client render (07).
4. Starting `init` commands that waited for hydration (ADR 0012).

Element hooks are not in this queue: their `client` calls run during commit (02).

Before 0.3.0 these were spread over Lit lifecycle hooks and `updateComplete` chains.

## View transitions

When `spec.viewTransition(prev, next, msg)` returns `true` for any message in a pending flush,
the whole flush runs inside `document.startViewTransition(() => flush())`, so the change is one
transition. The transition starts where the flush would have run (the microtask), not inside
`send()`; marks that arrive while its update callback is pending join that flush. Without support, or with `prefers-reduced-motion: reduce`, the flush runs as normal.
`settled()` waits for the transition's update callback, so focus and tests see the same DOM with
or without a transition.

## `settled()`

```ts
import { settled } from '@gyral/core';
await settled(); // no host is dirty, no flush is scheduled, no transition update is pending
```

- One shared promise per quiet period, not one per element. When the scheduler is idle it
  resolves after a few microtask turns (4), so follow-ups already resolving (a driver that
  answered at once, an output on its way) reach the scheduler before quiet is judged.
- It covers rendering only. Driver work (HTTP, timers) is outside it; tests drive time with
  `@gyral/testing`'s `virtualTime` and then `await settled()`.
- `@gyral/testing`'s `hydrated()` becomes: wait for the document's islands to be released (if
  asked), then `await settled()`. No polling passes.
- Shipped before the swap (gyral-g1r.4), backed by Lit, so tests were renderer-agnostic first.
  Since Phase 3 `packages/core/src/settled.ts` implements it on the scheduler
  (`packages/core/src/scheduler.ts`).
- Replaces `el.updateComplete` everywhere (about 270 test sites, the scaffold's `AGENTS.md`, the
  docs and the skill).

## Server

There is no scheduler on the server. Server rendering is a synchronous walk (06).

## The spike (gyral-g1r.8, before Phase 3 is finished)

The 0.2.0 benchmarks show select-row with 13–18 ms of idle time before paint against 2–3 ms of
script (Solid: 7 ms). The cause isn't known. The spike:

- Traces select-row and explains the idle gap (frame alignment, task boundaries, or something in
  intent delivery).
- Compares flush timings: microtask (the default above), end of task, and
  `requestAnimationFrame`.
- Records results here. If frame batching wins for bursty sources (pointer moves, WebSocket
  streams), add it as an **opt-in lane** for specific messages. It never becomes the default:
  `requestAnimationFrame` stops in background tabs and stalls tests in hidden browsers.

The scheduler is built with a lane field from the start, so adding that lane is not a redesign.

## Native primitives

| Need              | Primitive                                        | Baseline                                                          |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Batching          | `queueMicrotask`                                 | widely                                                            |
| Transitions       | `document.startViewTransition`                   | newly (2025-10-14) → feature-detect, degrades on its own (tier 1) |
| Reduced motion    | `matchMedia('(prefers-reduced-motion: reduce)')` | widely                                                            |
| Custom states     | `ElementInternals.states`                        | newly (2024-05-17), widely 2026-11 → feature-detect (tier 1)      |
| Yielding (future) | `scheduler.yield()`                              | not Baseline; only if the spike shows a need                      |

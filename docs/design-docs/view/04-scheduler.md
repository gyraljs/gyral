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
- Messages a spec lists in `renderOnFrame` mark their host in the **frame lane** instead
  (below): it renders in the next animation frame.
- Every delivered message marks its host, even when the reducer returns the same state. That
  render writes nothing: every part, form state included, writes only when its value changed
  since its last commit (02 "Live form state"), so a refused edit stays in the control. To
  put a control back, change the model (02 "Putting a control back").
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
flush continues with the other hosts. Post-render work that throws is logged the same way. A
development `HydrationMismatch` (07) is such an error: the host keeps the server's DOM.

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

## Frame lane (opt-in)

For bursty sources: many messages per frame, each in its own task (a WebSocket feed, `message`
events, sensors), into a component whose render isn't trivial.

```ts
define<State, Msg>('live-chart', {
  // init, intent, update, view …
  renderOnFrame: ['Ticked'],
});
```

- A message whose tag is in `spec.renderOnFrame` runs its reducer at once (`el.state` stays
  current) but marks its host in the frame lane: the host renders in the next animation frame
  (`requestAnimationFrame`), once, however many such messages arrived. `'StoreChanged'` in the
  list does the same for store changes that reach the host.
- Any microtask mark of the same host (another message, a prop, a store change not listed,
  reconnecting) moves it into the microtask flush: it renders there, frame work included, and
  not again in the frame. A host already dirty in the microtask lane stays there.
- The frame flush is an ordinary flush: parents first, children whose props change render in
  it, then the post-render queue; the loop guard and view transitions apply. `settled()` waits
  for it.
- **Pages without frames** (hidden tabs and iframes, minimized windows): if no animation frame
  comes within 100 ms of the request, a timer runs the flush, so `settled()` and tests in
  hidden browsers never stall. Background tabs throttle that timer (about once a second), which
  is fine for a page nobody sees.
- **Not for pointer moves.** Browsers already deliver continuous input (`pointermove`,
  `mousemove`, `wheel`) once per frame, just before animation frame callbacks, so the microtask
  flush already renders those once per frame. **Not for discrete interactions** (clicks, key
  presses, submits): their render would wait for the frame instead of being in the DOM before
  it, with no earlier paint, and code reading the DOM after the event would see old content.
- It never becomes the default (`requestAnimationFrame` stops in background tabs). Measured in
  the spike below.
- The lane belongs to the mark, not the host: `markDirty(task, onFrame)`; `element.ts` takes it
  from the message's tag (`host-model.ts`). The frame's callback hands its hosts to a microtask
  flush, which runs right after the callback, before that frame's style, layout and paint.
- Cost: about 0.14 KiB gzip in every app (it ships whether or not a spec uses it); the size
  budgets it pushed over were raised by that much (`scripts/size-budget.json`).

## `settled()`

```ts
import { settled } from '@gyral/core';
await settled(); // no host is dirty, no flush is scheduled, no transition update is pending
```

- One shared promise per quiet period, not one per element. When the scheduler is idle it
  resolves after a few microtask turns (4), so follow-ups already resolving (a driver that
  answered at once, an output on its way) reach the scheduler before quiet is judged.
- Code core loads lazily for rendering (the hydration code, 07 "Loading") counts as pending
  until the hosts waiting for it have started (`hold()` in the scheduler).
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

## The spike (gyral-g1r.8, 2026-10-06)

**Decision:** the microtask flush stays the default. An opt-in frame lane (`renderOnFrame`,
above) is added because it wins clearly for bursty sources and changes nothing else.

Setup: gyral-benchmarks branch `gyral-next`, `frameworks/gyral-next` (the six benchmark apps on
the 0.3 API, from tarballs packed from `next-spike`), trace timing, CPU 4x, headless Chromium
(Playwright 1.63). Full notes, traces tool and data: gyral-benchmarks
`results/2026-10-06-gyral-next-spike/` (`NOTES.md`, `flush.md`, `scripts/trace-timeline.mjs`).

### Where select-row's idle time comes from

- The "13–18 ms idle" in ADR 0018 is total minus script. The 0.2.0 release run's select row is
  16.7 ms: script 2.8, paint 6.0, **idle 6.5** (Solid: 7.6 = 0.9 + 5.6 + 1.0).
- **Not Gyral's flush.** In every traced sample (0.2.0 and 0.3) all of the click's work runs in
  one task: the click's `EventDispatch` → the capture listener on the shadow root
  (`composedPath()` walk, parser, reducer; 0.1–1 ms at 4x) → the microtask checkpoint inside
  the same dispatch (the flush; 2–4 ms) → done. No timer, animation-frame callback or extra
  task follows; no view-transition work (the table has no `viewTransition`, so
  `canTransition()` isn't called); no custom states or focus commands. The only task between
  the click and the frame is the harness's own DOM poll (a CDP evaluation, ~1 ms).
- **It is frame alignment.** The page is quiet before the click, so Chrome has stopped
  producing frames. The input (pointer move, down, focus, up and click are dispatched in one
  task) restarts them, and the first compositor BeginFrame comes 14–16.7 ms after that task
  starts. The click handler starts 2–6 ms into it and Gyral is done ~3 ms later; then the main
  thread waits for the BeginFrame. When a BeginFrame already fell inside the input task (frames
  still running), the frame starts 0.05–0.3 ms after the task instead. Samples are therefore
  bimodal for every framework (release run: Solid 6.9–8.2 or 17.3–20.1 ms, Gyral 0.2.0 8.7–10.1
  or 16.7–18.5 ms), and which mode a framework mostly gets varies between runs: Solid got the
  fast one in 11 of 15 samples in the release run and in 3 of 12 in a trace run of this spike
  (median 18 ms).
- **The paint is not the selection.** The benchmark's table apps have no CSS, so
  `class="danger"` changes nothing visible; the ~6 ms paint, the same for every framework, is
  the clicked button's `:active`/`:focus` change. With the flush moved to a later task, the
  frame painted before the render ran and no frame followed the render.
- For operations longer than a frame (swap, update, create) the BeginFrame passes during the
  script, so idle is 1–4 ms; their time is the browser's style, layout and paint (Chrome
  updates style and layout synchronously at the end of the input task, for hover state).
- So no flush timing can shorten select-row's idle: the update is in the DOM before the frame
  starts in every sample. A later flush can only miss that frame.

### Flush strategies

A temporary switch in `scheduler.ts` picked the flush per page (removed; the patch is in the
results folder). One interleaved session, 2 warm-up + 10 samples per cell, drift 2.8%. Median
total ms; in brackets script / paint / idle:

| Flush                         | create 1,000               | update every 10th       | select row               | swap rows                   | clear 1,000              |
| ----------------------------- | -------------------------- | ----------------------- | ------------------------ | --------------------------- | ------------------------ |
| 0.2.0 (Lit, microtask chains) | 247.6 (41.9 / 40.1 / 3.1)  | 80.9 (4.5 / 29.3 / 2.4) | 15.8 (3.1 / 7.2 / 4.2)   | 42.4 (3.3 / 20.8 / 2.1)     | 31.0 (26.2 / 2.7 / 2.2)  |
| **microtask** (default)       | 237.9 (35.5 / 39.8 / 1.9)  | 78.5 (4.4 / 28.1 / 1.6) | 13.4 (3.1 / 7.0 / 1.8)   | **37.1** (4.1 / 13.8 / 1.2) | 23.5 (19.9 / 2.4 / 0.9)  |
| end of task (MessageChannel)  | 250.6 (37.0 / 39.0 / 13.0) | 86.4 (4.7 / 36.8 / 3.4) | 12.4\* (0.8 / 6.5 / 2.1) | 47.7 (4.1 / 20.1 / 11.5)    | 32.5 (19.6 / 10.0 / 2.0) |
| `setTimeout(0)`               | 257.8 (35.9 / 39.1 / 13.1) | 86.3 (4.6 / 35.4 / 3.4) | 15.4\* (0.8 / 6.7 / 7.4) | 48.9 (4.5 / 21.1 / 8.0)     | 31.9 (20.1 / 9.7 / 1.8)  |
| `requestAnimationFrame`       | 234.4 (35.0 / 38.4 / 1.3)  | 75.7 (4.3 / 27.2 / 1.7) | 19.7 (3.2 / 7.0 / 6.4)   | 40.7 (4.2 / 12.8 / 5.2)     | 23.6 (19.0 / 2.7 / 0.9)  |

- **Microtask** is best or tied wherever the change paints.
- **End of task** (MessageChannel, `setTimeout(0)`): the click has already requested a frame,
  and Chrome runs that frame before the posted task, so the render misses it and needs the next
  one: about one frame more on swap, update, create and clear. \*Select row only looks fast
  because its render needs no paint (no CSS), so the measured frame is the click's own; the
  selection lands after it. `setTimeout` also clamps nested timers to 4 ms and is throttled in
  background tabs.
- **`requestAnimationFrame`**: the render waits for the next frame: more idle on short
  operations (select +6 ms, swap +4), the same on long ones. It also stops in background tabs.

### Bursty sources

A streaming driver delivering ticks as separate `message` tasks into a component with a
1,000-row keyed table and a 500-point SVG chart (the chart is rebuilt on every render), CPU 4x,
3 s windows, median of 3 rounds:

| Source             | Flush                   | Messages handled/s | Renders/s | Frames/s | Script |
| ------------------ | ----------------------- | -----------------: | --------: | -------: | -----: |
| 60/s               | microtask               |                 61 |        61 |     59.7 |     3% |
| 60/s               | `requestAnimationFrame` |                 61 |        56 |     59.7 |     3% |
| 250/s (timer)      | microtask               |                116 |       116 |     59.6 |     5% |
| 250/s (timer)      | `requestAnimationFrame` |                117 |        57 |     59.7 |     4% |
| 2,000/s (8 × 4 ms) | microtask               |                467 |       467 |     55.9 |    17% |
| 2,000/s (8 × 4 ms) | `requestAnimationFrame` |                812 |        42 |     59.7 |     8% |

At high rates the microtask flush renders once per message, the main thread saturates (99%
busy) and falls behind the source; rendering once per frame handles 74% more messages with
half the script time and no dropped frames. At or below a few messages per frame there is no
difference. The same test with the shipped lane (`renderOnFrame: ['Ticked']`, on a busier
machine) gave the same picture at 2,000/s: 383 vs 188 messages/s, 40 vs 31 frames/s, script 9%
vs 14%.

### Also found

- Intent delivery runs Gyral's capture listener for every `focusin`/`focusout`/`keydown`/
  `keyup` too (0.1–0.9 ms at 4x for the click's `focusin`), before the click: outside the
  benchmark's timing, but real input latency.
- `pick` returning an object (the documented idiom for passing intents into rows) costs two
  `Object.keys` arrays per row per render in `samePick`.

## Native primitives

| Need              | Primitive                                        | Baseline                                                          |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Batching          | `queueMicrotask`                                 | widely                                                            |
| Frame lane        | `requestAnimationFrame`, `setTimeout` fallback   | widely                                                            |
| Transitions       | `document.startViewTransition`                   | newly (2025-10-14) → feature-detect, degrades on its own (tier 1) |
| Reduced motion    | `matchMedia('(prefers-reduced-motion: reduce)')` | widely                                                            |
| Custom states     | `ElementInternals.states`                        | newly (2024-05-17), widely 2026-11 → feature-detect (tier 1)      |
| Yielding (future) | `scheduler.yield()`                              | not Baseline; only if the spike shows a need                      |

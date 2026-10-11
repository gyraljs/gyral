# ADR 0021 — Built-in view transitions for items that move between lists

Status: **rejected** (2026-10-08). The spike (below) showed that `view-transition-name` inside a
shadow root is never captured by a document transition in Chromium, Firefox or WebKit, and Gyral
components are shadow DOM by default. Moving items between lists stays a FLIP recipe, which works
inside shadow DOM. Revisit when scoped view transitions ship in all engines. Bead: gyral-dyn.18. Builds on the ADR 0001
addendum "View Transitions" (gyral-czi.12), view/04-scheduler.md "View transitions",
view/03-lists.md and ADR 0003.

**Scope note (owner, 2026-10-08):** the 0.4 items ship in 0.3.1, and breaking a 0.3.0 API is
acceptable this once (0.3.0 is not yet approved on npm). This ADR recommends the cleanest
design and lists what breaks.

## Context

A card that moves from one kanban column to another, a task that moves from "to do" to
"done", a file dragged between folders: in Gyral each column is its own `each()` list, so the
item is **removed from one list and created in another**. Nothing animates, because the
browser sees one element disappear and an unrelated one appear. `moveBefore()` keeps state
only for moves within one parent.

What exists:

- **`spec.viewTransition(prev, next, msg) => boolean`** (ADR 0001 addendum, gyral-czi.12). When it
  returns `true` for any message in a pending flush, the scheduler runs the whole flush inside
  `document.startViewTransition` (`scheduler.ts` `start()`, `transitions.ts`). It is skipped
  without the API or with `prefers-reduced-motion: reduce`, and `settled()` waits for the
  update callback. Since 0.3.1 builds with the Vite preset bundle `transitions.ts` only when
  a module names `viewTransition` (view/05 "Features register themselves").
- **The docs recipe** (skill `view.md`, "Moving items between lists"): a FLIP hook with the
  Web Animations API, and the native route: `viewTransition` plus a style binding
  `style="view-transition-name: task-${t.id}"` on each row.

The native route works, but every app has to get four things right by hand:

1. **Valid names.** `view-transition-name` takes a `<custom-ident>`; keys like `42`,
   `a b` or `ü/1` need escaping, and `none`, `auto` and `match-element` are reserved.
2. **Unique names.** Two elements with the same name in the document make the browser skip
   the whole transition (the update still runs). Two boards on one page, or a card shown in a
   list and in a detail pane, collide.
3. **Names only when needed.** Names written as bindings are always on. Every view
   transition on the page, a route change included, then captures every named card as its own
   group: hundreds of snapshots, and cards flying around when the user only changed page.
4. **Ordering.** The old state is captured at the first rendering opportunity after
   `startViewTransition` is called, and the new one after its update callback; names must be in place at both moments, and a `style`
   binding that rewrites `cssText` during the flush removes a name set any other way.

## Options

| Option                                                                                                               | Verdict                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Docs only (today): style bindings plus `viewTransition`                                                           | Leaves points 1–4 to every app                                                                                                                               |
| **B. A `transitionName(group, key)` hook, names applied only during transitions, groups chosen by `viewTransition`** | **Recommended**                                                                                                                                              |
| C. An `each()` option, `each(items, key, row, pick, { transition: 'task' })`, naming row roots                       | Couples a visual concern to the list primitive; rows with several roots, or whose card isn't the root element, don't fit; the cost lands in every `each` app |
| D. A built-in FLIP (Web Animations) in core                                                                          | Works everywhere, but needs layout reads around every render and is a real implementation (ADR 0003 tier 3) for an enhancement                               |
| E. A `transition()` command instead of the spec predicate                                                            | Two ways to ask for the same thing; the predicate already sees the message                                                                                   |

## Decision (recommended): option B

### API

```ts
import { define, each, html, intents, transitionName } from '@gyral/core';

const i = intents<Msg>();
const TaskRow = (t: Task) =>
  html`<li ${transitionName('task', t.id)}>
    <button type="button" value=${t.id} data-intent=${i.Move}>${t.label}</button>
  </li>`;

define<State, Msg>()('task-board', {
  // …
  // `true`: every group; an array: only these groups get names in this transition.
  viewTransition: (_prev, _next, msg) => (msg._tag === 'Move' ? ['task'] : false),
  view: (s) => html`
    <ul aria-label="To do">
      ${each(s.todo, (t) => t.id, TaskRow)}
    </ul>
    <ul aria-label="Done">
      ${each(s.done, (t) => t.id, TaskRow)}
    </ul>
  `,
});
```

```css
/* All tasks share the class; every name is unique. */
::view-transition-group(*.task) {
  animation-duration: 200ms;
}
```

- **`transitionName(group, key)`** is an element hook (view/02 "Element hooks"). Its
  `client` half registers the element under `group` and `key`; it writes nothing at
  render time and has no server half, so server markup and hydration are unchanged. Rows stay
  pure: both arguments come from the item.
- **`viewTransition` may return an array of groups** (additive: the type becomes
  `boolean | readonly string[]`). `true` names every registered group, as a page-wide
  transition would want; `false` or an empty array means no transition.
- **Names:** `<group>-<CSS.escape(String(key))>`, always a valid identifier and never a
  reserved word. `group` must be an identifier (development error otherwise). Where
  `view-transition-class` is supported (`CSS.supports`), the element also gets the group as
  its class, so one selector styles the whole group; elsewhere `::view-transition-group(*)`
  styles all groups.

### Scheduler steps (`transitions.ts`, view/04)

When a flush runs as a transition:

1. **Before** `document.startViewTransition`: write the names of every connected registered
   element in the requested groups (`el.style.setProperty('view-transition-name', …)`, a CSSOM
   write, so CSP-safe). The browser captures the old state with them.
2. **In the update callback:** run the flush (rows created in it register through the hook),
   then write the names again for the requested groups: new elements get theirs, and any
   name a `style` binding's `cssText` write removed is restored before the new state is
   captured.
3. **When `finished` settles** and no newer transition has started since: remove the names.
   A newer transition takes over the cleanup.
4. **Development:** a name that two connected elements would share is a warning naming the
   group and key (the browser would skip the transition). Production leaves it to the
   browser.

The registry is a `Map` from element to `[group, name]`, pruned of disconnected elements when
a transition starts and when it has doubled in size since the last prune, so the hook needs
no `dispose` (and doesn't pull in the disposal tracking `defineDisposableHook` costs).

### Interactions

- **`settled()`** keeps waiting for the update callback only, not for the animation: tests and
  focus see the new DOM at the same time with or without a transition. Names stay on elements
  until `finished`, so a test that reads `style` during the animation sees them; tests that
  compare markup emulate reduced motion (no transition, no names).
- **`renderOnFrame`:** a frame flush can run as a transition (view/04). Back-to-back
  transitions skip each other (the running one jumps to its end), so a bursty source and
  transitions don't mix; development warns when a frame-lane flush requests a transition.
- **Reduced motion:** unchanged: with `prefers-reduced-motion: reduce` no transition runs and
  no names are written. The item simply appears in its new list.
- **Focus:** moving an item between lists replaces its element, so a focused control inside it
  loses focus whatever animates it; apps answer the move with a `focus()` command, as today.
- **`each()`** is unchanged. Within one list, `moveBefore()` still keeps element state; the
  names make the move visible across lists.

### Spike before implementation (gate)

Shadow DOM is where the platform is least settled: the CSS Working Group made
`view-transition-name` tree-scoped, and engines have implemented that at different times. In
Chromium, Firefox and WebKit, check:

1. names set inside an open shadow root are captured by a document transition;
2. an element in one component's shadow root pairs with one in another's (a card moving
   between two column components);
3. a document stylesheet's `::view-transition-group(*.task)` matches them;
4. removing a name after the new state is captured leaves the running animation intact.

If 1–3 fail in an engine, the feature ships for light-DOM components and single shadow roots
only, with that limit in the docs; if 4 fails, names are removed only at `finished` (already
the plan) and the docs say so.

### Spike result (2026-10-08): the gate failed

Run in Playwright 1.63's Chromium, Firefox and WebKit (vitest browser mode), with a light-DOM
control that passed in all three:

| Where `view-transition-name` is set                                                                              | Captured by `document.startViewTransition`                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Light-DOM element, inline style                                                                                  | yes, all three engines                                         |
| Element inside an open shadow root: inline style                                                                 | **no**, all three                                              |
| …: the shadow root's adopted stylesheet or a `<style>` in it                                                     | **no**, all three                                              |
| The shadow host itself (in the document tree)                                                                    | yes, all three                                                 |
| Element inside a shadow root, named from a document sheet via `::part()`                                         | yes, all three                                                 |
| Chromium's scoped `element.startViewTransition()` on the host or a light-DOM ancestor, names inside shadow roots | **no** (only `root` captured); Firefox and WebKit lack the API |

So names are tree-scoped in every engine: an element inside a shadow root takes part in a
document transition only when its name comes from the document's tree (the host itself, or
`::part()` from a document stylesheet, which needs `exportparts` at every nesting level).
Checks 1–3 fail everywhere for shadow-DOM components, including a single shadow root, not only
pairing across roots. Gyral components use shadow DOM by default, so option B as written works
only when every component from the document down to the moving item is light DOM
(`shadow: false`). Implementation is stopped pending an owner decision. The spike's files are
kept outside the repo.

## Size

| Bundle                                 | Estimate (gzip)    | Basis                                                                                                                                                        |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apps that import `transitionName`      | +0.25 to +0.35 KiB | A sketch (registry, naming, apply and cleanup) measured 0.40 KiB alone, including a copy of today's detection, which apps already ship with `viewTransition` |
| Apps with `viewTransition` but no hook | about +20 B        | The array case in `start()`                                                                                                                                  |
| Apps without `viewTransition`          | 0                  | The build leaves `transitions.ts` out (0.3.1)                                                                                                                |
| Server                                 | 0                  | No server half                                                                                                                                               |

## Baseline and compatibility

| Primitive                                       | Status                                         | Tier (ADR 0003)                                                                             |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Same-document View Transitions                  | newly available 2025-10-14, widely 2028-04-14  | 1: detect and skip; the item appears in its new list. Removal of the detection: gyral-m56.5 |
| `view-transition-class`                         | newer than Level 1 (confirm in `web-features`) | 1: set only when `CSS.supports` says so; `::view-transition-group(*)` otherwise             |
| `CSS.escape`, `style.setProperty`, `matchMedia` | widely                                         | —                                                                                           |

- **No FLIP fallback in core.** Motion is an enhancement; below the API the list still
  updates correctly. The FLIP recipe stays in the docs for apps that want animation in older
  engines before 2028.
- `viewTransition` returning a boolean behaves as before; style-binding names written by hand
  keep working (always on, as before).

## Breaking changes (0.3.0 → 0.3.1)

None needed: `viewTransition`'s return type widens from `boolean` to
`boolean | readonly string[]`, and `transitionName` is new. (Considered and not recommended:
making `true` name no groups, so that hook names appear only when asked for by group. It
would make the common single-board case more verbose for no safety gain.)

## Implementation plan (0.3.1)

| Step | Files                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | The spike above, as a throwaway browser test in all three engines; its result goes into this ADR                                                                                                                                           |
| 1    | `packages/core/src/hooks/transition-name.ts` (new: hook, registry, name building), `index.ts`                                                                                                                                              |
| 2    | `packages/core/src/transitions.ts` (apply before, re-apply in the callback, clean up at `finished`), `scheduler.ts` (`requestTransition(groups)`), `host-model.ts`, `types.ts`, `spec-features.ts` and `spec-features-used.ts` (signature) |
| 3    | A small task-board example (two lists, moves both ways) with `demo.mjs`, replacing the FLIP recipe as the docs' main route; the recipe stays as the fallback for older engines                                                             |
| 4    | Docs: view/04 "View transitions", ADR 0001 addendum, skill `view.md` and `components.md`, changeset                                                                                                                                        |

Size: +0.25 to +0.35 KiB gzip for apps that use the hook, about +20 B for apps with
`viewTransition` only, 0 otherwise (see Size). Tests below.

## Testing plan

- **Unit (Chromium):** name building (numbers, spaces, non-ASCII, leading digits, reserved
  words); registry pruning; group selection (`true`, arrays, `false`); duplicate-name warning.
- **Scheduler (Chromium, real API):** names present at old-state capture and after the update
  callback (read inside the callback and in `ready`); removed after `finished`; a newer
  transition keeps its names when the older one finishes; a `style=${…}` binding on the named
  row doesn't lose the name; `settled()` resolves before `finished`.
- **Pairing:** a card moving between two `each` lists in one component, and between two child
  components' shadow roots: `document.getAnimations()` during the transition includes a
  group animation for that name (the spike's checks, kept as tests in all three engines via
  `packages/core/test/view/browsers.config.ts`).
- **Degradation:** with the API removed and with reduced motion emulated, the DOM after
  `settled()` equals the transition case and no names are written.
- **Size:** `pnpm size` for an example using the hook (the kanban-style recipe becomes an
  example) and for examples without it (unchanged).

## Open questions for the owner

1. **Group selection.** (a) `viewTransition` may return group names (recommended);
   (b) keep it boolean; every Gyral transition names every group.
2. **API surface.** (a) The `transitionName(group, key)` hook (recommended); (b) an `each()`
   option naming row roots.
3. **Reduced motion.** (a) Skip transitions, as today (recommended); (b) run them and let CSS
   decide (cross-fade under `prefers-reduced-motion`).
4. **Transition types.** (a) Not in 0.3.1 (recommended); (b) pass the groups as
   `startViewTransition({ update, types })` where supported.
5. **Testing.** (a) Tests emulate reduced motion when they compare markup (recommended);
   (b) a `@gyral/testing` helper that awaits the running transition's `finished`.

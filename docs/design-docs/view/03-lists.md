# 03 — Lists

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018 (decision D). Phase 2.

## The API

```ts
each<T>(
  items: readonly T[],
  key: (item: T) => string | number,
  row: (item: T) => ChildValue,
): ListResult;
each<T, P>(
  items: readonly T[],
  key: (item: T) => string | number,
  row: (item: T, picked: P) => ChildValue,
  pick: (item: T) => P,
): ListResult;
```

```ts
const Row = (r: Row, selected: boolean) =>
  html`<tr class=${selected ? 'danger' : ''}>
    <td>${r.id}</td>
    <td>${r.label}</td>
  </tr>`;

view: (s) =>
  html`<tbody>
    ${each(
      s.rows,
      (r) => r.id,
      Row,
      (r) => r.id === s.selected,
    )}
  </tbody>`;
```

`each` is the only keyed list primitive. It replaces `repeat` and `keyed`. Plain arrays still
work in child holes (positional, 02); use `each` whenever items can be inserted, removed or
reordered.

**Size (gyral-g1r.18):** the result of `each` carries the function that commits it, so the keyed
path (reconciliation, the two-ended scan and LIS, row skipping) is bundled only by apps that call
`each`: about 1.2 KiB gzip that an app without keyed lists doesn't ship. Positional arrays stay
in core.

## Row skipping

Gyral state is immutable, so an unchanged item object means an unchanged item. A row
re-renders only when:

- `item !== previous item`, or
- `pick(item)` differs from the previous pick: `Object.is` for primitives; for arrays and plain
  objects, same length/keys and `Object.is` per element/key (one level).

Otherwise the row is skipped: no `row()` call, no template result, no part comparisons. Moving a
skipped row moves its nodes without re-rendering it.

`pick` still runs for every row, but it is meant to be trivial (a comparison or a field read).
In select-row, 998 of 1,000 rows cost one comparison each; only the old and new selection render.

## Rows must be pure

Skipping is only correct if a row's output depends on nothing but `(item, picked)` and module
constants. Intent names are such constants: `intents<Msg>()` (gyral-g1r.19) returns the same
names object the view gets as `i`, as a module-level constant, so rows name intents without
passing them through `pick`:

```ts
const i = intents<Msg>();
const Row = (t: Todo, selected: boolean) =>
  html`<li class=${selected ? 'selected' : ''}>
    <input type="checkbox" value=${t.id} ?checked=${t.done} data-intent=${i.Toggle} />
  </li>`;
// view: each(s.todos, (t) => t.id, Row, (t) => t.id === s.selected)
```

Two guards:

1. **ESLint rule** (`gyral/each-row-purity` in `@gyral/core/eslint`, works without Vite; 09
   "ESLint"): the `row` function may reference only its parameters, its own locals,
   module-level bindings and imports. A reference to anything in the view's scope (`s`, `i`,
   `ctx`, locals) is an error: "`row` reads `s.selected`; return it from `pick` and take it as
   the second argument." A helper function declared beside the row is followed instead of
   flagged: calling it is fine when it, too, reads only those.
2. **Development check:** after each commit, rows are re-evaluated anyway and their results
   compared with what is committed (template, by id or identity, and values, recursively). A
   difference warns once per row function: "… depends on something not passed through `item`
   or `pick`" (`view/render/dev-check.ts`). It catches what the lint can't see, such as a
   helper reading changing module state. At most 200 rows are checked per flush (per `render`
   call outside one), rotating through each list. Production has no check.

## Keys

- Required. A key is a string or number, unique within the list. For lists of primitives the key
  can be the value: `each(tags, (t) => t, Tag)`.
- Duplicate keys are a development error. In production they are handled best effort (matched
  by position where the scan can), never crashing.

## Reconciliation

Given the old rows (keys, nodes) and the new items:

1. Build the new key order. Reuse the row for every key present in both; create rows for new
   keys; remove rows for keys that are gone.
2. Re-render reused rows that aren't skipped. A row whose template changed is replaced.
3. Put rows in order with the fewest DOM moves (chosen by benchmark in Phase 2, below): match
   keys with a two-ended scan, then a key map for what is left; the rows matched in place by
   the scan, or else the rows on a longest increasing subsequence of old positions, stay; every
   other reused row moves, and new rows are inserted.
4. Move rows with `moveBefore()` where the browser has it: it keeps focus, selection, CSS
   animations, `<iframe>` and `<video>` state. Otherwise use `insertBefore`. Components define
   `connectedMoveCallback` so a `moveBefore` move doesn't disconnect them (05).

Rows re-render in document order (prefix, middle, suffix) before anything moves, so element
hooks run in document order too.

### The benchmark (Phase 2, 2026-10-06)

`pnpm bench:view` (`packages/core/bench/lists.bench.test.ts`): Chromium (Playwright 1.63,
headless), production build of `view/`, one keyed list of 1,000 `<tr>` rows reordered without
changing any item (every row is skipped, so the time is matching, bookkeeping and DOM moves).
The common prefix and suffix are trimmed before any candidate runs, so remove-one, insert-one
and prepend never reach them. Medians of 61 interleaved runs, in ms (the machine was loaded;
compare columns, not absolute values):

| Change                   | (a) map + LIS | (b) two-ended + map | (c) hybrid | (c) with `insertBefore` |
| ------------------------ | ------------- | ------------------- | ---------- | ----------------------- |
| swap rows 1 and 998      | 0.225         | 0.130               | 0.130      | 0.125                   |
| remove one (500)         | 0.090         | 0.095               | 0.085      | 0.090                   |
| insert one in the middle | 0.070         | 0.070               | 0.065      | 0.065                   |
| reverse                  | 0.695         | 0.620               | 0.625      | 0.585                   |
| shuffle                  | 1.055         | 1.065               | 1.095      | 0.995                   |
| replace first and last   | 0.355         | 1.520               | 0.350      | 0.340                   |
| prepend 10               | 0.115         | 0.100               | 0.110      | 0.090                   |
| move one (10 → 900)      | 0.165         | 0.090               | 0.095      | 0.095                   |

- **(a)** builds a key map over the whole reordered window even for a swap, then an O(n log n)
  LIS: minimal moves, but the bookkeeping costs 70% more than (b) on swap-rows.
- **(b)** needs no map for swaps, single moves and reversals, but once its ends stop matching it
  moves every row it finds before the old head: replacing the first and last row moves all 998
  rows in between (4.3× slower than (a)).
- **(c), shipped:** (b)'s scan for matching only, with the rows it matched in place kept and the
  crossed ones moved (no map, no LIS); when the scan gets stuck, (a)'s map and LIS for the rest.
  It ties (b) where (b) is good and (a) where (b) breaks down.
- `moveBefore` costs 0–10% over `insertBefore` on move-heavy changes; it stays (it keeps focus
  and element state, step 4).

**Size of each half (gyral-g1r.18):** in a production bundle the two-ended scan costs about 0.08 KiB
gzip and the LIS about 0.13 KiB (both only in apps that call `each`). Neither is dropped: with LIS
only, "swap rows" (0.15 ms) was no longer faster than lit-html's (0.13–0.15 ms in the last in-repo
comparison, below); with the two-ended scan only, "replace first and last" takes 0.63 ms instead of
0.13 ms. Bench rerun after the size pass: (a) 0.150 / 0.125, (b) 0.070 / 0.625, (c) 0.070 / 0.130 ms
(swap / replace first and last).

### The renderer against lit-html (last in-repo run, 2026-10-06)

Until Phase 7 `pnpm bench:view` also rendered the js-framework-benchmark rows with lit-html 3.3.0
(`repeat`, production build, run as a black box) to check that no operation got slower than
0.2.0's renderer. Lit left the repository's dependency tree with Phase 7 (ADR 0018 merge gate 5),
so the bench now times Gyral alone, and comparisons with other frameworks, Lit included, live in
the gyral-benchmarks repository. The last run (Chromium, cross-origin isolated, medians of 25
runs after 5 warm-ups, in ms):

| Operation             | Gyral | lit-html | Ratio |
| --------------------- | ----- | -------- | ----- |
| create 1k rows        | 4.49  | 6.15     | 0.73  |
| replace 1k rows       | 5.02  | 7.57     | 0.66  |
| update every 10th row | 0.13  | 0.24     | 0.55  |
| swap rows (1, 998)    | 0.13  | 0.17     | 0.71  |
| select row            | 0.05  | 0.14     | 0.34  |
| remove row            | 0.04  | 0.14     | 0.28  |
| append 1k rows        | 4.25  | 6.13     | 0.69  |
| clear 1k rows         | 0.47  | 1.30     | 0.36  |

### Fast paths

- **Create into empty:** build all rows into one `DocumentFragment` and insert it once.
- **Clear:** when the new list is empty and the list's hole is the sole content of its parent
  element, clear with `parent.replaceChildren()` instead of removing rows one by one.
- **Append only:** when the old keys are a prefix of the new keys, only create and insert the
  tail (likewise prepend and insert-only: new rows go into one fragment).
- **Replace all:** when no key survives, clear (as above) and create into one fragment.

### Row boundaries

A row tracks its first and last node. Rows with a single root element (the common case) need no
markers; multi-root rows are tracked by their node range. No comments are emitted per row, on
the client or the server.

## Native primitives

| Need             | Primitive                                | Baseline                                                                   |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Batch insert     | `DocumentFragment`                       | widely                                                                     |
| Clear            | `replaceChildren()`                      | widely                                                                     |
| Move, keep state | `moveBefore()` + `connectedMoveCallback` | not Baseline → trivial inline fallback to `insertBefore` (ADR 0003 tier 2) |
| Move             | `insertBefore`                           | widely                                                                     |

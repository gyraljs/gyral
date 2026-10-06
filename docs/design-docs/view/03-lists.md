# 03 — Lists

Status: **accepted** (2026-10-06). ADR 0018 (decision D). Phase 2.

## The API

```ts
each<T, K extends string | number, P = undefined>(
  items: readonly T[],
  key: (item: T) => K,
  row: (item: T, picked: P) => ChildValue,
  pick?: (item: T) => P,
): ListResult
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

Skipping is only correct if a row's output depends on nothing but `(item, picked)`. Two guards:

1. **ESLint rule** (`@gyral/core/eslint`, works without Vite): the `row` function may reference
   only its parameters, module-level bindings and imports. A reference to anything in the view's
   scope (`s`, `i`, `ctx`, locals) is an error: "`row` reads `s.selected`; return it from `pick`
   and take it as the second argument."
2. **Development check:** skipped rows are re-evaluated anyway and their template results
   compared with the committed ones (template id and values, recursively). A difference warns
   once per call site: "a row depends on something not passed through `item` or `pick`". It
   catches what the lint can't see, such as a helper reading changing module state. At most 200
   skipped rows are checked per flush, rotating through the list. Production has no check.

## Keys

- Required. A key is a string or number, unique within the list. For lists of primitives the key
  can be the value: `each(tags, (t) => t, Tag)`.
- Duplicate keys are a development error. In production the later duplicates are treated as
  new rows.

## Reconciliation

Given the old rows (keys, nodes) and the new items:

1. Build the new key order. Reuse the row for every key present in both; create rows for new
   keys; remove rows for keys that are gone.
2. Re-render reused rows that aren't skipped. A row whose template changed is replaced.
3. Put rows in order with the fewest DOM moves. Candidates to benchmark in Phase 2 (record the
   winner and why here): a longest-increasing-subsequence plan over old positions, and a
   two-ended scan with a key map. The js-framework-benchmark swap-rows, remove-row and
   partial-update operations decide.
4. Move rows with `moveBefore()` where the browser has it: it keeps focus, selection, CSS
   animations, `<iframe>` and `<video>` state. Otherwise use `insertBefore`. Components define
   `connectedMoveCallback` so a `moveBefore` move doesn't disconnect them (05).

### Fast paths

- **Create into empty:** build all rows into one `DocumentFragment` and insert it once.
- **Clear:** when the new list is empty and the list's hole is the sole content of its parent
  element, clear with `parent.replaceChildren()` instead of removing rows one by one.
- **Append only:** when the old keys are a prefix of the new keys, only create and insert the
  tail.

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

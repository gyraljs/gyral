# ADR 0023 — Inferring intent names from the parser keys (curried `define`)

Status: **proposed** (2026-10-08), for **0.3.1**. Follows the ADR 0001 addendum "Intent names"
(gyral-dyn.12), which shipped `IntentName<'…'>` in 0.3.1 and kept this alternative as
possible future work. Recommendation: **don't adopt**; keep `IntentName<'…'>`.

**Scope note (owner, 2026-10-08):** 0.3.1 may break 0.3.0 APIs this once. So the question is
not "add a second form beside `IntentName`" but "should a curried `define` **replace**
`IntentName` outright?"

## Context

Intent names are message tags, or names declared in the message union:

```ts
type Msg = Send | Sent | IntentName<'Archive' | 'Restore' | 'Star'>;
define<State, Msg>('doc-table', {
  intent: { Archive: …, Restore: …, Star: … }, // each declared name: a required parser
  update: { Send: …, Sent: … },                 // no reducer for declared names
  view: (s, i) => html`<button data-intent=${i.Star}>…</button>`,
});
const ti = intents<Msg>(); // rows get the same names
```

Each name is written twice (union and parser key), the union holds names that aren't
messages (hence `Messages<M>` for helpers), and a brand keeps them from being built.

Names could instead be **inferred from the keys of `intent`**. TypeScript has no partial
type-argument inference: once `define<State, Msg>(…)` is written, every other type parameter
takes its default and none is inferred from the spec. The standard workaround is currying:
the outer call takes the explicit types, the inner call infers.

## The prototype

Types written against `@gyral/core`'s current exports and checked with TypeScript 6.0.3
under the repo's `tsconfig.base.json` (strict, `exactOptionalPropertyTypes`):

```ts
type Variant<M extends Tagged, K> = Extract<M, { readonly _tag: K }>;

/** Tag keys return their own variant; any other key is an intent name returning any message. */
type InferredIntents<M extends Tagged, P, I> = {
  readonly [K in keyof I]: K extends M['_tag']
    ? IntentParser<Variant<M, K>, P>
    : IntentParser<M, P>;
};
/** The view's `i`: the tags plus the inferred names. */
type InferredNames<M extends Tagged, I> = IntentNames<M> & {
  readonly [K in Exclude<keyof I & string, M['_tag']>]: K;
};

// define03: today's define(), called with a cast; the runtime is unchanged.
export function define<S, M extends Tagged, P extends object = object, O extends Tagged = never>() {
  return <const I>(tag: string, spec: InferredSpec<S, M, P, I>) =>
    define03(tag, spec) as InferredClass<S, M, P, O, Exclude<keyof I & string, M['_tag']>>;
}
/** Rows: the names of a component's class. */
export declare function intentsOf<C extends { readonly intentNames?: string }>(): {
  readonly [K in NonNullable<C['intentNames']>]: K;
};
```

```ts
type Msg = { readonly _tag: 'Send'; readonly action: Action } | { readonly _tag: 'Sent' };

export const DocTable = define<State, Msg>()('doc-table', {
  init: () => ({ docs: [] }),
  intent: {
    Archive: ({ value }) => send('archive', Number(value)),
    Restore: ({ value }) => send('restore', Number(value)),
    Star: ({ value }, { props }) => send('star', Number(value)), // input and ctx stay typed
  },
  update: { Send: (s) => s, Sent: (s) => s },
  view: (s, i) =>
    html`<ul>
        ${each(s.docs, (d) => d.id, DocRow)}
      </ul>
      <button data-intent=${i.Star}>Star all</button>`,
});

const ti = intentsOf<typeof DocTable>();
function DocRow(doc: Doc): TemplateResult {
  // the return annotation is required (below)
  return html`<li>
    <button value=${doc.id} data-intent=${doc.archived ? ti.Restore : ti.Archive}>…</button>
  </li>`;
}
```

It works: names are written once, parsers keep their contextual types (`input`, `ctx.props`),
a tag key still must return its own variant, and `update` still refuses a reducer for a name.

## Type errors, as users would see them

Real `tsc` output from the prototype:

```text
// 1. A typo in the view: caught, as today
Property 'Archvie' does not exist on type 'InferredNames<Msg, { Archive: unknown; }>'.
Did you mean 'Archive'?

// 2. A typo in a parser key, the view names the right one: caught, but the hint points the
//    wrong way (it suggests the typo)
Property 'Archive' does not exist on type 'InferredNames<Msg, { Archvie: unknown; }>'.
Did you mean 'Archvie'?

// 3. A typo in a parser key nobody names (`Sedn` for `Send`): NO type error. It becomes a
//    new intent name; only the gyral/unused-intent lint warning remains.

// 4. A tag key returning another variant: caught, as today
Type '{ _tag: "Sent"; }' is not assignable to type 'ParseResult<{ readonly _tag: "Send";
readonly id: number; }> | Promise<…>'. Property 'id' is missing in type '{ _tag: "Sent"; }'…

// 5. A reducer for an inferred name: caught, as today
Object literal may only specify known properties, and 'Archive' does not exist in type
'Update<State, Msg, object>'.

// 6. An inferred name's parser returning a non-message
Type '{ _tag: "Archived"; }' is not assignable to type 'ParseResult<Msg> | Promise<…>'.

// 7. Forgetting the second call: one clear error, then every parameter is `any`
Expected 0 arguments, but got 2.
Parameter 's' implicitly has an 'any' type.

// 8. A row typo: caught
Property 'Archvie' does not exist on type '{ readonly Archive: "Archive"; }'.

// 9. A row without a return annotation that the view uses: a cycle, four errors
'DocTable' implicitly has type 'any' because it does not have a type annotation and is
referenced directly or indirectly in its own initializer.
'view' implicitly has return type 'any' because …
'ti' implicitly has type 'any' because …
'DocRow' implicitly has return type 'any' because …
```

For comparison, today's `define<State, Msg>` with an undeclared key fails at the key:
`Object literal may only specify known properties, and 'Archive' does not exist in type
'Intents<Msg, object>'.`

## Comparison

| Concern                            | `IntentName<'…'>` in the union (0.3.1)        | Curried `define<S, M>()(…)` with inference                                                  |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Names written                      | twice, kept in step by the types              | once                                                                                        |
| Typo in a parser key               | compile error at the key                      | a new name: error only if something names the right one (2), else silent (3)                |
| Rows (`each`)                      | `intents<Msg>()`, no annotations              | `intentsOf<typeof C>()` **and** an explicit return type on every row that names intents (9) |
| Shape of every component           | unchanged since 0.1                           | `define<S, M>()(…)` everywhere; forgetting `()` gives `any`s (7)                            |
| Message union                      | holds non-messages; `Messages<M>` for helpers | messages only; no brand, no `Messages<M>`                                                   |
| Editor completion of `intent` keys | tags offered from the declared type           | keys are being inferred, so tag completion is likely lost (not measured)                    |
| Runtime                            | 0 B                                           | one extra closure per `define` (~20 B gzip in total)                                        |

The decisive rows are the second and third. Gyral's intent design rests on "a typo in an
intent name is a compile error" (ADR 0001); inference turns a misspelled key into a valid new
name, and rows, where most per-item intents live, pay with an annotation on every row and a
type-only reference to a component declared elsewhere. Writing a name twice, checked by the
compiler, is the cheaper cost.

## Decision (recommended)

**Keep `IntentName<'…'>`; don't adopt the curried form.** Record the prototype and its errors
here. Revisit if TypeScript gains partial type-argument inference (then `define<S, M>(…)`
could infer the keys without currying, and rows could still take names from the union).

If the owner adopts it anyway, it should **replace** `IntentName` (the scope note allows the
break), not sit beside it: two ways to name intents would double the docs and the errors.

### Breaking changes if adopted

- `define<S, M, P, O>(tag, spec)` becomes `define<S, M, P, O>()(tag, spec)` in every component,
  example, template, skill page and doc block (the docs' typechecked blocks find them).
- `IntentName`, `Messages` and the declared-name branch of `Intents` are removed; components
  that used them move the names into `intent` keys.
- Rows that use extra names switch from `intents<Msg>()` to `intentsOf<typeof Component>()` and
  annotate their return type.

### Implementation plan if adopted (0.3.1)

- Files: `packages/core/src/define.ts`, `types.ts` (`InferredIntents`, `InferredNames`, the
  class's type-only `intentNames`), `intent.ts` (`intentsOf`), `index.ts`; every `define(` call
  in `examples/`, `packages/devtools`, `packages/create-gyral/templates`, the skill and the
  docs; ADR 0001 addendum; changeset; migration notes.
- Tests: rewrite `packages/core/test/intent-names.test.ts` around inference, including
  `@ts-expect-error` cases 1, 2, 4–9 above and a test that pins case 3 as accepted (so the gap
  stays documented); `pnpm typecheck` time before and after on the whole repo.
- Size: about +20 B gzip per app (the outer call); no other runtime change.

### If not adopted (recommended)

- Files: this ADR and one line in the ADR 0001 addendum's "Why declared in the union" pointing
  here. No code change; 0 B.

## Baseline and compatibility

Types only; no browser features involved. TypeScript ≥ 5.0 for `const` type parameters (the
repo is on 6.0).

## Open questions for the owner

1. **Adopt?** (a) Keep `IntentName<'…'>` (recommended); (b) replace it with the curried
   `define` in 0.3.1, accepting silent key typos and annotated rows.
2. **If (b): row names.** (a) `intentsOf<typeof C>()` (prototyped); (b) export the names from
   the component module as a separate `const` (no cycle, but names written twice again).

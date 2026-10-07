# ADR 0003 — Browser support: Baseline widely available

Status: **accepted** (2026-10-04)

> **Amended by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): the fallback tiers below come from it, and shared state is stores (ADR 0013), not a signals polyfill.

## Decision

Shipped code (packages and examples) targets **Baseline widely available**: features that
have worked across all major engines for 30+ months. This is the `.browserslistrc` query,
checked by `eslint-plugin-compat` (`compat/compat`).

Features that are newer (Baseline _newly available_, or behind a tier in the `modern-css`
skill) may be used only as **progressive enhancement**: feature-detect in JS, or use
`@supports` in CSS, and keep the baseline experience working and good.

## Known enhancement-only features (keep this table current)

| Feature        | Baseline path                                  | Enhancement                                                                                              |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Router         | History API + `popstate` + link-click capture  | Navigation API, URLPattern                                                                               |
| Intent sources | `data-intent` with click/submit/input/change   | Invoker commands (`command=`), with a Gyral fallback event where `CommandEvent` is missing (gyral-czi.6) |
| Overlays       | `<dialog>`, `popover` (check status when used) | Anchor positioning                                                                                       |
| Shared state   | Stores (ADR 0013)                              | Native TC39 signals when they ship                                                                       |
| Page changes   | Plain re-render                                | View Transitions (`viewTransition`)                                                                      |
| State styling  | ARIA attributes / markup                       | Custom states (`states`, `:state()`)                                                                     |

Check a feature's current status in `web-features` / MDN before relying on it, and record the
answer here.

## Fallback tiers (ADR 0018, 2026-10-06)

Code is written against the native API first. When a primitive is not widely available yet,
its fallback falls into one of three tiers:

| Tier                     | Rule                                                                                                                | Examples                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Degrades on its own   | No fallback code: detect and skip                                                                                   | View Transitions, custom states, `setHTMLUnsafe` → `innerHTML`      |
| 2. Trivial (a few lines) | Inline, next to the native call                                                                                     | `moveBefore` → `insertBefore`, `requestIdleCallback` → `setTimeout` |
| 3. A real implementation | An internal module, never a global polyfill; loaded with `import()` only when detection fails if it is ≳ 300 B gzip | `URLPattern` matcher, History API fallback, invoker-command shim    |

- **Every fallback has a removal date** (when its primitive becomes widely available: 30 months
  after newly available), tracked as a bead under the native-audit epic. On that date, delete it.
- **Never patch globals.** Fallbacks are private to Gyral and never change `window`.
- A lazily loaded tier-3 fallback makes that path asynchronous at startup on old browsers only
  (for example, the router matches its first route a moment later).
- A tier-3 fallback's `import()` is part of every build that may reach it, even where no browser
  fetches it (Vite adds its preload helper for it). A build may leave it out only when it can
  tell no code can need it: client-only builds keep the invoker-command shim only when a module
  may make a root listen for `command` (view/07-hydration.md "Client-only builds", 0.3.1); when
  the build can't tell (a bound `data-intent-on`, `raw()` markup), the fallback stays.

Dates from `web-features` 3.35.0 (widely available = newly + 30 months):

| Primitive                                                             | Newly available | Widely available |
| --------------------------------------------------------------------- | --------------- | ---------------- |
| Declarative shadow DOM                                                | 2024-02-20      | 2026-08-20 (now) |
| Custom states (`:state()`)                                            | 2024-05-17      | 2026-11-17       |
| `popover`                                                             | 2025-01-27      | 2027-07-27       |
| `<details name>`                                                      | 2024-09-03      | 2027-03-03       |
| `URLPattern`                                                          | 2025-09-15      | 2028-03-15       |
| View Transitions                                                      | 2025-10-14      | 2028-04-14       |
| Invoker commands                                                      | 2025-12-12      | 2028-06-12       |
| Navigation API                                                        | 2026-01-13      | 2028-07-13       |
| CSS `@scope`                                                          | 2026-03-24      | 2028-09-24       |
| `moveBefore`, `requestIdleCallback`, `scheduler.yield`, Sanitizer API | not Baseline    | —                |

## CSS is checked too (gyral-8ht.5)

`pnpm lint:css` (part of `pnpm lint` and `pnpm check`) runs stylelint with
`stylelint-plugin-use-baseline` at `available: 'widely'` (data from `web-features`) over every
`css` template in `packages/*/src` and `examples/*/src` (through `postcss-styled-syntax`) and over
`examples/**/*.css`. Patterns:

- **Enhancement-only properties** (`text-wrap`, `accent-color`, `content-visibility`, anchor
  positioning…) go in `@supports (property: value)`. The condition must name every guarded
  property and value. JS feature detection for the same feature must use the same condition
  (for example `ANCHOR_SUPPORT` in the autocomplete example).
- **`light-dark()`**: declare the light value first, then override it in
  `@supports (color: light-dark(black, white)) { … }`. Older browsers get the light theme.
- **Custom states**: guard the rule with `@supports selector(:state(name))`, and keep the
  meaning in ARIA or markup.
- **At-rules that can't be guarded and that old browsers skip as a whole**:
  `ignoreAtRules` in `stylelint.config.mjs`. Each one is listed here:

  | At-rule           | Why it is safe                                           |
  | ----------------- | -------------------------------------------------------- |
  | `@starting-style` | Entry animations only; without it, elements just appear. |

- **Plugin false positives** (features missing from `web-features`, such as
  `sibling-index()`): a `stylelint-disable-next-line plugin/use-baseline -- reason` comment.

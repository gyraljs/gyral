# ADR 0003 — Browser support: Baseline widely available

Status: **accepted** (2026-10-04)

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
| Shared state   | Signals via polyfill (`@lit-labs/signals`)     | Native TC39 signals when they ship                                                                       |
| Page changes   | Plain re-render                                | View Transitions (`viewTransition`)                                                                      |
| State styling  | ARIA attributes / markup                       | Custom states (`states`, `:state()`)                                                                     |

Check a feature's current status in `web-features` / MDN before relying on it, and record the
answer here.

## CSS is checked too (gyral-8ht.5)

`pnpm lint:css` (part of `pnpm lint` and `pnpm check`) runs stylelint with
`stylelint-plugin-use-baseline` at `available: 'widely'` (data from `web-features`) over every
`css` template in `packages/*/src` and `examples/*/src` (through `postcss-lit`) and over
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

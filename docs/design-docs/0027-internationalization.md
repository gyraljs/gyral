# ADR 0027 — Application-owned internationalization with native Intl

Status: **proposed** (2026-10-11). Spike: gyral-1zd.12. No new package, component
option or accepted API decision is introduced by this proposal.

## Context

A pure view must produce the same first render in the server and browser. Implicit locale,
time zone, current time and asynchronously arriving translations can break that contract
([hydration spec](view/07-hydration.md)). Lit's removal also removed `@lit/localize` as a
framework integration. Gyral needs a recommendation based on its own props, stores and drivers.

## Recommendation

Keep internationalization in application code, using native `Intl.NumberFormat`,
`DateTimeFormat`, `PluralRules`, `RelativeTimeFormat` and `ListFormat`. Start with complete
typed catalogs bundled for the page's supported languages. Split them only when measurements
justify it. Core gains no runtime dependency or implementation.

| Input           | Source and use                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locale          | Resolve an allowlisted BCP 47 locale at the request boundary from the route, saved preference or parsed `Accept-Language`; choose a documented fallback. Never infer it independently in the view from `navigator.language` or process defaults. |
| Time zone       | Validate a saved IANA zone, or choose a documented default such as `UTC`. Pass it to every date/time formatter. Browser discovery belongs in a post-hydration driver.                                                                            |
| Catalog version | Pin server catalogs and client assets to the same deployment. Seed stable locale/version identifiers, not message functions or formatter objects.                                                                                                |
| Time            | Put an instant into state before rendering, or subscribe to time after hydration. Relative-time formatting uses that same reference instant; views never call `Date.now()`.                                                                      |
| Direction       | Keep document and localized-region `lang`/`dir` consistent. Isolate user-supplied names with `bdi`; use locale-neutral `time` element `datetime` values.                                                                                         |

One component can receive locale/zone as declared props. An application can declare an i18n
store of those JSON values and read `ctx.read(i18n)`. Give `renderPage({ stores })` its
**per-request** instance; the existing seed restores it before component hydration
([ADR 0013](0013-shared-state.md)). Never mutate a process-global language variable.

## Catalog types, loading and switching

An app owns a `Messages` interface of literal text and pure functions with named, typed
parameters. Every locale satisfies that interface. Keep grammatical choices in complete
messages; do not concatenate translated fragments. `PluralRules` selects categories with an
`other` branch for each language. Interpolate translated text in ordinary `html` holes;
rich text uses explicit template elements, and translations never become `raw()` markup.

Message functions are loaded code, not serialized model values. For a large catalog, a named
driver imports an allowlisted module and validates its shape. Use a switch lane for locale
changes so an earlier slow load cannot override a later choice. Keep the working locale
until the catalog is ready; one reducer changes locale, direction and catalog identifier
together. Expected loading failures become messages and preserve the working catalog.

Load the first catalog before server rendering and before releasing its client components.
Existing loader/island boundaries supply the ordering; views never return promises. Static
sites can emit one URL per locale and preload only its first catalog. Small bundled catalogs
need no loading driver.

## Hydration and formatter caches

Explicit locale/zone and deployment-pinned catalogs are necessary, but **not sufficient for
identical formatted text**: runtimes may use different ICU/CLDR data. Intl permits
implementation-dependent output; a shared locale does not promise byte-identical spelling.

For exact first-render identity, seed the server's formatted strings in component state
alongside raw values, locale and zone. The browser's first view renders those strings
unchanged. A later explicit locale/time update formats the raw values with browser Intl and
records the result in state. Do not conceal locale mismatches with recovery rendering.

An application helper may cache formatters by locale, zone and **all** options. Its bounded
cache must not select a language or retain request-specific state. Handle invalid options
and missing locales at the boundary using `supportedLocalesOf`/`resolvedOptions`. Required
locales must exist in the deployed server runtime's ICU data.

## Size and validation

Native Intl data ships with the runtime. A Vite 8.3.2 production ES-module build of two
three-key catalogs plus direct wrappers for the five formatters above measured **582 B
minified / 309 B gzip** (level 9). The wrappers construct formatters on demand; this does not
include caching, real catalogs, loading code or polyfills. It is a wiring measurement, not
an application budget. Core gains **zero bytes** under this proposal. Reproduce the
measurement with `node scripts/measure-i18n.mjs`; the fixture is in `scripts/spikes/intl.mjs`.

Before accepting a public helper, test two concurrent SSR locales; first-render DOM identity
with seeded formatted text; right-to-left content; plurals with `other`; a daylight-saving
boundary; unsupported locale fallback; stale catalog responses; loading failure; and
initial/all-chunk app size. The spike proposes this validation; it does not claim those
application scenarios are already tested.

## Documentation outline

1. A localized price/date component with explicit props and native Intl.
2. Typed complete messages, plural categories and safe interpolation.
3. A request-scoped locale store and shared catalog version.
4. Exact first-render text, ICU differences, `lang`, `dir`, `bdi` and `time`.
5. Locale switching through a cancellable driver and expected failure messages.
6. Optional catalog splitting, server locale coverage and measured size tradeoffs.

## Alternatives and sources

An ICU-message library may suit translator tooling or complex nested messages. It remains an
app dependency with size and locale tests. A Gyral package needs a demonstrated missing
capability before it duplicates existing props, stores and drivers.

- [MDN: Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [MDN: Internationalization](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization)
- [ECMA-402: implementation dependencies](https://tc39.es/ecma402/#sec-implementation-dependencies)

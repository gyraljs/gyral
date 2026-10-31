# 09 — Template rules

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018 (decision I). Phases 1 (rule engine,
runtime) and 6 (compiler surface, ESLint).

Templates are static, so mistakes can be found before code runs. With Lit (Gyral 0.2) most of
them showed up at runtime, some only during SSR.

## One rule set, three places

The rules live once, in `view/`'s normalizer (01). Three tools surface them with the same
messages:

| Where                              | When                                                                                         | Audience                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| Vite compiler (`@gyral/core/vite`) | `vite build`: the build fails with a code frame (the dev server uses the runtime path)       | everyone on the preset (default) |
| Runtime preparer, development mode | first render of the call site: throws, naming it (`at file:line:col`, 01 "Source locations") | the no-build-step path, tests    |
| ESLint (`@gyral/core/eslint`)      | in the editor and `eslint .`: one error per template, at the markup it is about              | everyone, before saving          |

Production builds made with the Vite preset contain none of this code (a build without it
keeps the runtime preparer, 01 "Runtime"). Every message follows core belief 7: it says what
is wrong **and what to write instead**, and links the spec section. The rule engine stops at a
template's first error (its tokenizer can't recover), so every tool reports one per template:
fix it, and the next one shows.

## Errors

| #   | Pattern                                                                                                                                                                                                                                                                                   | Why                                                                     | The message points to                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `@click=${…}` (any `@` binding)                                                                                                                                                                                                                                                           | Gyral has no event bindings                                             | `data-intent=${i.Name}` (ADR 0001)                                                              |
| 2   | `<${tag}>`, `</${tag}>`, `${name}="x"`                                                                                                                                                                                                                                                    | No dynamic tag or attribute names                                       | conditional templates                                                                           |
| 3   | A hole inside `<script>`, `<style>`, `<noscript>` (0.3.10), a comment, a `<template>` element or a doctype                                                                                                                                                                                | Security; no part can live there                                        | an attribute, a CSS custom property via `style=${…}`, or `raw()`; static markup in `<noscript>` |
| 4   | `.checked`, `.selected`, `.open`, `.indeterminate`, `.value` on form controls (02's table); `modal`/`popover-open` other than `?modal` on `<dialog>` and `?popover-open` on a `[popover]` element (02 "Dialogs and popovers")                                                             | One spelling for form state; property bindings don't reach the server   | `?checked=${…}`, `value=${…}`, …                                                                |
| 5   | A multi-part attribute without quotes: `class=a${b}`                                                                                                                                                                                                                                      | Ambiguous                                                               | `class="a ${b}"`                                                                                |
| 6   | A self-closing non-void HTML element: `<my-el />`, `<div/>`                                                                                                                                                                                                                               | HTML ignores the `/`, so the element swallows its following siblings    | `<my-el></my-el>`                                                                               |
| 7   | Markup the HTML parser **repairs** (strict: end tags must match, optional end tags are not inferred, duplicate attributes and stray `</p>`/`</br>` are errors): `<tr>` directly in `<table>`, a block element in `<p>`, `<a>` in `<a>`, `<form>` in `<form>`, `<li>` directly in `<div>`… | The DOM would differ from the source, and part paths would shift        | the valid structure (`<tbody>`, …)                                                              |
| 8   | An `each` row that reads view-scope variables (03)                                                                                                                                                                                                                                        | Rows would be skipped and the UI would go stale                         | return it from `pick`                                                                           |
| 9   | `each` without a key function                                                                                                                                                                                                                                                             | Keys are required (03)                                                  | `each(items, (x) => x.id, Row)`                                                                 |
| 10  | SVG content in the wrong place: SVG-only elements (`<g>`, `<path>`) at the top level of an `html` template; HTML at the top level of an `svg` template; HTML-only elements inside SVG content; a bound `xlink:href=${…}` (0.3.1)                                                          | The parser creates SVG elements only in SVG content                     | `` svg`<g>…</g>` `` or `<svg>`; `html`; `href=${…}`                                             |
| 11  | A document-level template (`<html>`, `<head>`, `<body>`, doctype) rendered in the browser                                                                                                                                                                                                 | Page shells are server-only (01)                                        | render it with `@gyral/core/server`                                                             |
| 12  | A hole in `<textarea>`/`<title>` that isn't the whole content                                                                                                                                                                                                                             | The content is one value (02)                                           | `<textarea>${v}</textarea>`                                                                     |
| 13  | A named character reference other than `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;` in the static text of a bound or custom-element attribute                                                                                                                                         | The full entity table is too large to ship                              | the character itself, or a numeric reference                                                    |
| 14  | A boolean attribute (`selected`, `checked`, `disabled`, `open`, `required`, `multiple`, `muted`, … ) bound as `name=${…}` on an HTML element (0.3.1)                                                                                                                                      | Any string turns it on, `"false"` included                              | `?name=${…}`                                                                                    |
| 15  | A tag name that starts with a capital letter, has no hyphen and is no HTML element: `<SignupForm>`, `<TaskApp />` (0.3.5)                                                                                                                                                                 | HTML lowercases it to an unknown element that renders nothing           | the defined tag name, `<signup-form></signup-form>`                                             |
| 16  | An attribute name with capitals on a custom element in HTML content: `<pool-card playerBase=${n}>`, `?isOpen=${…}`, `maxItems="3"` (0.3.7)                                                                                                                                                | HTML lowercases it to one no prop reads: prop attributes are kebab-case | `player-base=${…}`, or the property `.playerBase=${…}`                                          |

Allowed: `<textarea>${v}</textarea>` (live value, 02) and `<title>${t}</title>` (text).

**Rule 15 since 0.3.5** (gyral-7se.35): in the agent pilot, coding agents wrote JSX-style
component references, `<SignupForm></SignupForm>` for a component defined as
`my-signup-form`. Types and build passed, and the page rendered nothing in its place. A start
tag spelled with a capital first letter, without a hyphen, whose lower-case name is not an HTML
element is now an error that says to write the defined tag name and import its module. HTML
names in any case (`<DIV>`, `<IFrame>`), hyphenated names (`<Signup-Form>` is
`<signup-form>`), SVG and MathML content (`<LinearGradient>` parses as `linearGradient`), and
lower-case unknown elements are not checked; markup the rule rejects never rendered a component.
Since 0.3.6 the runtime preparer checks rule 15 only in development (`#view-dev`), as it
checks call sites: `vite build` with the preset and ESLint always check it, and production
bundles built without the preset don't carry the list of HTML element names (about 0.4 KiB
gzip). The rule's code is `view/normalize/component-name.ts`, passed to the tree builder.
A hyphenated tag that nothing defines is legal markup, so it is a development warning instead
(Warnings, below).

**Rule 16 since 0.3.7** (gyral-k97.5): football-pool-tracker wrote `playerBase=${x}` on its
own components. HTML lowercases attribute names, so that set `playerbase`, while a Gyral prop
`playerBase` reads `player-base` (05 "Props"); the value was lost without a word, and the app
added eight `attribute: 'playerbase'` overrides. An attribute name with a capital letter on a
custom element (a hyphenated tag) in HTML content is now an error naming both spellings that
work: the kebab-case attribute and the property binding. Property bindings (`.playerBase`),
built-in HTML elements (`tabIndex=` is the same attribute as `tabindex=`) and SVG content
(`viewBox`) are not checked. An `attribute: 'playerbase'` override keeps working; templates
write it in lower case. It is checked where rule 15 is: always by `vite build` with the preset
and ESLint, by the runtime preparer in development only (`component-name.ts`). Page HTML and
host frameworks, which no template rule sees, get a development warning instead (G0024, 05
"Accessors and upgrade capture").

**Rule 14 since 0.3.1** (gyral-1zd.25): `<option selected=${on}>` renders `selected="false"` when
`on` is false, and the browser selects the option anyway; an app shipped exactly that. A known
HTML boolean attribute bound with a plain `name=${…}` (or a quoted multi-part value) is now an
error that points to `?name=${…}`. Static boolean attributes, custom elements (their attributes
are their own), SVG and MathML are not checked, and neither is `hidden`, whose
`hidden="until-found"` is a real string value.

**Rule 10 since 0.3.1** (gyral-c5d.8): the `svg` tag is back (01 "svg templates"). An `svg`
template's top level is SVG content, so SVG-only elements are fine there; HTML at its top level
is the error instead, and its message points to `html` or `<foreignObject>`. An `html`
template's SVG-only top level stays an error, and its message now points to `svg`. Elements
that end SVG content (`<div>`, `<p>`, `<b>`, … inside `<svg>`) stay rule 7 inside an element
and are rule 10 at an `svg` template's top level. HTML-only elements that don't end it
(`<button>`, `<input>`, `<section>`, …) would become unknown SVG elements that render nothing;
they are rule 10 in both kinds of template (inline `<svg>` in `html` included). So are bound
namespaced attributes on SVG elements (`xlink:href=${…}`, `xml:lang=${…}`, `xmlns…`): the
parser puts them in their own namespace, `setAttribute` can't, so bind `href=${…}` (SVG 2);
static ones are fine (02 "Attribute values").

**`<noscript>` since 0.3.10** (gyral-qqa): gathered-wishes put a notice for visitors without
JavaScript, `<noscript><p>…</p></noscript>`, next to its recorder's controls. With scripting on,
the HTML parser keeps a `<noscript>`'s content as raw text, so the server's notice became one
Text node in the page, while the client's template held elements: Chromium and WebKit parse a
`<template>`'s content with scripting off (Firefox with it on). Hydration compared the two and
failed (G0062: development threw, so the component never hydrated; production rendered it fresh
with G0063), and the development runtime's rule 7 check reported the same difference as a
repair. A client render built live elements from the notice in Chromium and WebKit: a
`<noscript><style>` applied to the page and an `<img>` loaded while scripts ran.

- The normalizer already read `<noscript>` content as raw text (the parser with scripting on,
  the only way Gyral's client runs), so a hole in it was rule 3. The message now says why and
  what to write: the notice as static markup, with anything that changes outside the
  `<noscript>`. Attribute holes on the `<noscript>` element itself are fine.
- The content is **server-only** (01 "Normalization"): the server writes it as the template
  has it (whitespace minified as markup, since a browser without scripts shows it as markup);
  the client's template HTML leaves it out, so a client render creates the `<noscript>` empty
  in every engine.
- Hydration adopts the `<noscript>` element as it is, its attribute parts included, and never
  walks or compares its content (07 "The parallel walk").
- `raw()` markup follows the same rule (gyral-uvj.2, 02 "`raw(html)`"): the server writes it
  verbatim, and the client empties every `<noscript>` in it before inserting it.

Rule 3 is checked where it always was: `vite build`, the runtime preparer and ESLint. Tested in
`core/test/view/noscript-hydration.test.ts` (both builds; also in Firefox and WebKit through
`browsers.config.ts`), `core/test/noscript-hydration.test.ts` (shadow and light hosts from real
server output), `rules.node.test.ts`, `segments.node.test.ts` and
`compiler/parse5.node.test.ts`.

Not handled yet: `<select>` content under the new customizable-select parsing, CDATA in SVG.

### How rule 7 is checked

- **Compiler:** parse5, a spec-compliant HTML parser, runs as a **build-time-only** dependency.
  Its tree is compared with the normalizer's own tree; any difference is a repair. parse5 never
  reaches the browser or the server renderer.
- **Runtime preparer:** the normalizer's own repair checks run first; then the browser parses
  the template HTML (`<template>` + `innerHTML`) and the whole parse is compared with the tree
  the normalizer computed paths for (`view/prepare.ts`). Any difference is reported with the
  same message.
- **ESLint:** runs the normalizer's own repair checks (the common cases above, by tag
  structure), as the development runtime does before the browser parses. The parse5 comparison
  is compiler-only, so a rare repair can pass the editor and fail `vite build`. The compiler is
  the authority.

## ESLint: `@gyral/core/eslint`

A flat-config plugin with three rules, all in `gyral.configs.recommended` (setup:
[consumer-setup.md](../../references/consumer-setup.md) "ESLint"). ESLint (9 or 10) is an
optional peer dependency.

- **`gyral/template`** (rules 1–7, 10, 12–16, and a function expression written directly in
  a hole, `${() => …}`: views attach no closures, 02 "Properties"): every `html` or `svg` tagged
  template whose tag is imported from a template source (`import { html } from '@gyral/core'`
  under any local name, or `ns.html` for `import * as ns`; the same for `svg`, checked as SVG
  content, 0.3.1) goes through `checkTemplate` (`view/normalize/check.ts`):
  the normalizer's own steps, which also report where they stopped. The message is the
  TemplateError's first line, identical to the runtime's and the compiler's; the editor's
  location replaces the `near:`/`at` context. The location is mapped back from the minified
  cooked strings through whitespace minification, escapes, line continuations and CRLF line
  ends, and covers the tag or end tag (rules 4, 6, 7, 10, 12–16), the text run (rule 7), the
  `${…}` (rules 1, 2, 3, 5 at a hole), or else the character the tokenizer stopped at.
- **`gyral/each-row-purity`** (rules 8, 9; 03 "Rows must be pure"): `each`'s row (inline, or a
  name bound to a function: `function Row`, `const Row = …`) may read only its parameters and
  locals, module-level bindings, imports and globals. A read of an enclosing function's binding
  (the view's `s`, `i`, `ctx`, its locals) is an error naming it: "`row` reads `s.selected`;
  return it from `pick` and take it as the second argument (view/03-lists.md)." A helper
  function declared beside the row is followed: calling it is fine when it reads only the same.
  An `each` call without a key function is rule 9.

- **`gyral/unused-intent`** (a warning, 0.3.1, gyral-g1r.25): a parser in
  `define()(tag, { intent: { Name: … } })` that no template in the module names with
  `data-intent`. A parser runs only when an element names it, so it is a renamed intent or dead
  code (messages that only come from commands need no parser). A name counts as used when the
  module mentions it as a property (`i.Name`, a module-level `intentsOf<typeof C>()`
  constant's `r.Name`, `{ Name } = i`, `i['Name']`) or as a static or literal `data-intent` value in an
  `html` or `svg` template.
  - **Why static:** the rule sees every template in the module, including branches that never
    rendered (a dialog's buttons, an error state). A runtime check only knows the templates
    rendered so far, so it would warn about conditional intents or have to guess when to
    judge (after N renders, at disconnect); either gives false positives. So there is no
    runtime warning.
  - **Skipped** (no false positives where names may be used elsewhere): a component whose
    view is imported, whose view hands its intents to an imported function, or whose module
    exports an `intentsOf()` constant; and every component of a module whose templates call or
    pass on a function imported from another module (a shared table header that renders
    `data-intent="Sort"`, rows defined elsewhere). Intents named only in `raw()` markup or in
    another module's templates are the remaining blind spot: disable the warning on that line.
  - On 2026-10-07 it reported two dead parsers in this repo's test fixtures and nothing in the
    examples, gyral.dev or gyral-shop.

Not checked by ESLint: rule 7's parse5 comparison (compiler) and the browser's own parse
(development runtime); rule 11, because the editor can't tell where a template renders (a page
shell is right on the server); rows ESLint can't follow statically (a row returned by a call, a
parameter), which 03's development check covers.

Options (every rule): `{ sources: ['@gyral/core', 'my-design-system'] }`, the same list as the Vite
preset's `compiler.sources` (`gyral({ compiler: { sources } })`). Core's own code and
tests, which import `html` and `each` from core's modules by relative path, are recognised without
it.

## Warnings

| Pattern                                                | Why                                                                    | Where                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `raw()` rendered in the browser                        | It works, but every change re-parses the markup (02)                   | development runtime, once per page                                                               |
| `true` in a child hole                                 | Usually a `cond && x` slip (02)                                        | development runtime and server render, once per part                                             |
| An object in an attribute or text-content hole         | It is written as `String(v)` (02)                                      | development runtime and server render, once per part                                             |
| A function in a property binding (`.onclick=${fn}`)    | Views attach no closures; props are data (02)                          | development runtime, once per part (0.3.1)                                                       |
| An intent parser that the component's view never names | Probably a renamed intent or dead code                                 | ESLint `gyral/unused-intent` (0.3.1, below)                                                      |
| A custom-element tag on the page that nothing defines  | It renders nothing: usually a component module the entry never imports | development runtime, 3 s after load and after each later `define()`, once per tag (G0014, 0.3.6) |

## Native primitives

None at runtime: rules are build-time and development-time only. The development runtime
relies on the browser's own parser (`<template>` + `innerHTML`) to reveal repairs.

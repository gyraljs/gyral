# 09 — Template rules

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018 (decision I). Phases 1 (rule engine,
runtime) and 6 (compiler surface, ESLint).

Templates are static, so mistakes can be found before code runs. With Lit (Gyral 0.2) most of
them showed up at runtime, some only during SSR.

## One rule set, three places

The rules live once, in `view/`'s normalizer (01). Three tools surface them with the same
messages:

| Where                              | When                                                                                   | Audience                         |
| ---------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| Vite compiler (`@gyral/core/vite`) | `vite build`: the build fails with a code frame (the dev server uses the runtime path) | everyone on the preset (default) |
| Runtime preparer, development mode | first render of the call site: throws                                                  | the no-build-step path, tests    |
| ESLint (`@gyral/core/eslint`)      | in the editor and `eslint .`: one error per template, at the markup it is about        | everyone, before saving          |

Production builds made with the Vite preset contain none of this code (a build without it
keeps the runtime preparer, 01 "Runtime"). Every message follows core belief 7: it says what
is wrong **and what to write instead**, and links the spec section. The rule engine stops at a
template's first error (its tokenizer can't recover), so every tool reports one per template:
fix it, and the next one shows.

## Errors

| #   | Pattern                                                                                                                                                                                                                                                                                   | Why                                                                   | The message points to                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `@click=${…}` (any `@` binding)                                                                                                                                                                                                                                                           | Gyral has no event bindings                                           | `data-intent=${i.Name}` (ADR 0001)                               |
| 2   | `<${tag}>`, `</${tag}>`, `${name}="x"`                                                                                                                                                                                                                                                    | No dynamic tag or attribute names                                     | conditional templates                                            |
| 3   | A hole inside `<script>`, `<style>`, a comment, a `<template>` element or a doctype                                                                                                                                                                                                       | Security; no part can live there                                      | an attribute, a CSS custom property via `style=${…}`, or `raw()` |
| 4   | `.checked`, `.selected`, `.open`, `.indeterminate`, `.value` on form controls (02's table)                                                                                                                                                                                                | One spelling for form state; property bindings don't reach the server | `?checked=${…}`, `value=${…}`, …                                 |
| 5   | A multi-part attribute without quotes: `class=a${b}`                                                                                                                                                                                                                                      | Ambiguous                                                             | `class="a ${b}"`                                                 |
| 6   | A self-closing non-void HTML element: `<my-el />`, `<div/>`                                                                                                                                                                                                                               | HTML ignores the `/`, so the element swallows its following siblings  | `<my-el></my-el>`                                                |
| 7   | Markup the HTML parser **repairs** (strict: end tags must match, optional end tags are not inferred, duplicate attributes and stray `</p>`/`</br>` are errors): `<tr>` directly in `<table>`, a block element in `<p>`, `<a>` in `<a>`, `<form>` in `<form>`, `<li>` directly in `<div>`… | The DOM would differ from the source, and part paths would shift      | the valid structure (`<tbody>`, …)                               |
| 8   | An `each` row that reads view-scope variables (03)                                                                                                                                                                                                                                        | Rows would be skipped and the UI would go stale                       | return it from `pick`                                            |
| 9   | `each` without a key function                                                                                                                                                                                                                                                             | Keys are required (03)                                                | `each(items, (x) => x.id, Row)`                                  |
| 10  | SVG-only top level (`<g>`, `<path>` outside an `<svg>`)                                                                                                                                                                                                                                   | No `svg` tag; the HTML parser would not create SVG elements           | wrap in `<svg>`                                                  |
| 11  | A document-level template (`<html>`, `<head>`, `<body>`, doctype) rendered in the browser                                                                                                                                                                                                 | Page shells are server-only (01)                                      | render it with `@gyral/core/server`                              |
| 12  | A hole in `<textarea>`/`<title>` that isn't the whole content                                                                                                                                                                                                                             | The content is one value (02)                                         | `<textarea>${v}</textarea>`                                      |
| 13  | A named character reference other than `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;` in the static text of a bound or custom-element attribute                                                                                                                                         | The full entity table is too large to ship                            | the character itself, or a numeric reference                     |

Allowed: `<textarea>${v}</textarea>` (live value, 02) and `<title>${t}</title>` (text).

Not handled yet: `<select>` content under the new customizable-select parsing, CDATA in SVG,
`<noscript>` as raw text.

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

A flat-config plugin with two rules, both in `gyral.configs.recommended` (setup:
[consumer-setup.md](../../references/consumer-setup.md) "ESLint"). ESLint (9 or 10) is an
optional peer dependency.

- **`gyral/template`** (rules 1–7, 10, 12, 13, and a function expression written directly in
  a hole, `${() => …}`: views attach no closures, 02 "Properties"): every `html` tagged template whose tag is
  imported from a template source (`import { html } from '@gyral/core'` under any local name,
  or `ns.html` for `import * as ns`) goes through `checkTemplate` (`view/normalize/check.ts`):
  the normalizer's own steps, which also report where they stopped. The message is the
  TemplateError's first line, identical to the runtime's and the compiler's; the editor's
  location replaces the `near:`/`at` context. The location is mapped back from the minified
  cooked strings through whitespace minification, escapes, line continuations and CRLF line
  ends, and covers the tag or end tag (rules 4, 6, 7, 10, 12, 13), the text run (rule 7), the
  `${…}` (rules 1, 2, 3, 5 at a hole), or else the character the tokenizer stopped at.
- **`gyral/each-row-purity`** (rules 8, 9; 03 "Rows must be pure"): `each`'s row (inline, or a
  name bound to a function: `function Row`, `const Row = …`) may read only its parameters and
  locals, module-level bindings, imports and globals. A read of an enclosing function's binding
  (the view's `s`, `i`, `ctx`, its locals) is an error naming it: "`row` reads `s.selected`;
  return it from `pick` and take it as the second argument (view/03-lists.md)." A helper
  function declared beside the row is followed: calling it is fine when it reads only the same.
  An `each` call without a key function is rule 9.

Not checked by ESLint: rule 7's parse5 comparison (compiler) and the browser's own parse
(development runtime); rule 11, because the editor can't tell where a template renders (a page
shell is right on the server); rows ESLint can't follow statically (a row returned by a call, a
parameter), which 03's development check covers.

Options (both rules): `{ sources: ['@gyral/core', 'my-design-system'] }`, the same list as the Vite
preset's `compiler.sources` (`gyralVitePreset({ compiler: { sources } })`). Core's own code and
tests, which import `html` and `each` from core's modules by relative path, are recognised without
it.

## Warnings

| Pattern                                                | Why                                                  | Where                                                |
| ------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| `raw()` rendered in the browser                        | It works, but every change re-parses the markup (02) | development runtime, once per page                   |
| `true` in a child hole                                 | Usually a `cond && x` slip (02)                      | development runtime and server render, once per part |
| An object in an attribute or text-content hole         | It is written as `String(v)` (02)                    | development runtime and server render, once per part |
| A function in a property binding (`.onclick=${fn}`)    | Views attach no closures; props are data (02)        | development runtime, once per part (0.3.1)           |
| An intent parser that the component's view never names | Probably a renamed intent or dead code               | not checked yet: no tool reports it in 0.3.0         |

## Native primitives

None at runtime: rules are build-time and development-time only. The development runtime
relies on the browser's own parser (`<template>` + `innerHTML`) to reveal repairs.

# 09 — Template rules

Status: **accepted** (2026-10-06). ADR 0018 (decision I). Phases 1 (rule engine, runtime) and 6
(compiler surface, ESLint).

Templates are static, so mistakes can be found before code runs. Lit found most of them at
runtime, some only during SSR.

## One rule set, three places

The rules live once, in `view/`'s normalizer (01). Three tools surface them with the same
messages:

| Where                              | When                                                    | Audience                         |
| ---------------------------------- | ------------------------------------------------------- | -------------------------------- |
| Vite compiler (`@gyral/core/vite`) | build and dev server: the build fails with a code frame | everyone on the preset (default) |
| Runtime preparer, development mode | first render of the call site: throws                   | the no-build-step path, tests    |
| ESLint (`@gyral/core/eslint`)      | in the editor                                           | everyone, before saving          |

Production builds contain none of this code. Every message follows core belief 7: it says what
is wrong **and what to write instead**, and links the spec section.

## Errors

| #   | Pattern                                                                                                                                                       | Why                                                                   | The message points to                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `@click=${…}` (any `@` binding)                                                                                                                               | Gyral has no event bindings                                           | `data-intent=${i.Name}` (ADR 0001)                               |
| 2   | `<${tag}>`, `</${tag}>`, `${name}="x"`                                                                                                                        | No dynamic tag or attribute names                                     | conditional templates                                            |
| 3   | A hole inside `<script>`, `<style>` or a comment                                                                                                              | Security; no part can live there                                      | an attribute, a CSS custom property via `style=${…}`, or `raw()` |
| 4   | `.checked`, `.selected`, `.open`, `.indeterminate`, `.value` on form controls (02's table)                                                                    | One spelling for form state; property bindings don't reach the server | `?checked=${…}`, `value=${…}`, …                                 |
| 5   | A multi-part attribute without quotes: `class=a${b}`                                                                                                          | Ambiguous                                                             | `class="a ${b}"`                                                 |
| 6   | A self-closing custom element: `<my-el />`                                                                                                                    | HTML ignores the `/`, so the element swallows its following siblings  | `<my-el></my-el>`                                                |
| 7   | Markup the HTML parser **repairs**: `<tr>` directly in `<table>`, a block element in `<p>`, `<a>` in `<a>`, `<form>` in `<form>`, `<li>` directly in `<div>`… | The DOM would differ from the source, and part paths would shift      | the valid structure (`<tbody>`, …)                               |
| 8   | An `each` row that reads view-scope variables (03)                                                                                                            | Rows would be skipped and the UI would go stale                       | return it from `pick`                                            |
| 9   | `each` without a key function                                                                                                                                 | Keys are required (03)                                                | `each(items, (x) => x.id, Row)`                                  |
| 10  | SVG-only top level (`<g>`, `<path>` outside an `<svg>`)                                                                                                       | No `svg` tag; the HTML parser would not create SVG elements           | wrap in `<svg>`                                                  |
| 11  | A document-level template (`<html>`, `<head>`, `<body>`, doctype) rendered in the browser                                                                     | Page shells are server-only (01)                                      | render it with `@gyral/core/server`                              |

Allowed: `<textarea>${v}</textarea>` (live value, 02) and `<title>${t}</title>` (text).

### How rule 7 is checked

- **Compiler:** parse5, a spec-compliant HTML parser, runs as a **build-time-only** dependency.
  Its tree is compared with the normalizer's own tree; any difference is a repair. parse5 never
  reaches the browser or the server renderer.
- **Development runtime:** a repaired template loses or moves part markers when the browser
  parses it, so the part count or paths don't match the normalizer's. That is reported with the
  same message.
- **ESLint:** checks the common cases above by tag structure. The compiler is the authority.

## Warnings

| Pattern                                                | Why                                                  |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `raw()` in a component that renders in the browser     | It works, but every change re-parses the markup (02) |
| An intent parser that the component's view never names | Probably a renamed intent or dead code               |
| `true` in a child hole (runtime, development)          | Usually a `cond && x` slip (02)                      |

## Native primitives

None at runtime: rules are build-time and development-time only. The development runtime
relies on the browser's own parser (`<template>` + `innerHTML`) to reveal repairs.

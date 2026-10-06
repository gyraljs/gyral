# 01 — Templates

Status: **accepted** (2026-10-06). ADR 0018. Phases 1 (normalizer, runtime path) and 6 (compiler).

## Authoring

Views are written with one tag, `html`, imported from `@gyral/core`, on the server and in the
browser alike:

```ts
view: (s, i) => html`<button data-intent=${i.Increment}>Count: ${s.count}</button>`;
```

There is no `svg` tag. Inline `<svg>` markup inside `html` is parsed by the HTML parser as SVG
(foreign content), so icons and charts keep working. A template whose top level is SVG-only
content (`<g>`, `<path>` without an `<svg>` around them) is an error (09).

## Template results

`html` returns a **template result**: a reference to the template plus this call's values. It
is recognised by a module-private symbol, so data parsed from JSON or a network response can
never be mistaken for a template (it can't carry the symbol). Results are immutable and cheap:
no copying of values, no work beyond a cache lookup.

## Normalization

The normalizer is one pure function from a call site's static strings to a **template object**.
The Vite compiler, the browser's runtime preparer and the server renderer all run the same
function, so server and client can't disagree about a template's structure or id.

Steps, in order:

1. **Tokenize** the strings with an HTML tokenizer state machine (data, tag name, attribute
   name, attribute value in double/single/no quotes, comment, raw text for `<script>` and
   `<style>`, escapable raw text for `<textarea>` and `<title>`). The state at each hole decides
   its kind (02) or a rule violation (09).
2. **Minify whitespace** (rules below). Binding positions never move: the strings keep their
   count, so holes line up.
3. **Emit the template HTML** for the client: static markup with every bound attribute removed
   and every child hole replaced by nothing, or by an anchor comment where the anchor rule
   needs one (02). The emitted HTML is also exactly what the server writes around values (06).
4. **Build the part table:** one entry per hole, in source order: kind, the path to its element
   (or to its parent element and position for child holes), the attribute name and static
   strings for attribute holes, and flags (`sole`: the hole is its parent's only child node).
   Paths are child-index paths from the template's content root.
5. **Compute the template id** from the normalized strings (after step 2).

### Whitespace

Carried over unchanged from ADR 0016's addendum (it is Gyral's own design):

- Whitespace-only text that contains a newline is removed when it sits next to a template edge,
  a block-level tag, or the inside edge of `<button>`/`<select>`. Between two inline neighbours
  (phrasing elements, custom elements, holes, comments) it collapses to one space.
- Other runs of whitespace in text collapse to one space; a leading or trailing run with a
  newline next to one of those edges is removed.
- `<pre>`, `<textarea>`, `<script>`, `<style>` and `<title>` contents, tags, attribute values and
  comments are copied unchanged.
- Idempotent: normalizing normalized strings changes nothing.

There is no opt-out tag. Exact whitespace belongs in `<pre>`, or in a value.

### Template ids

- Deterministic across compiler, browser and server; fast; at least 52 bits; printed as a short
  base-36 string.
- Collisions are detected where all templates are visible: the compiler fails the build, and the
  development runtime warns when two different normalized templates share an id.
- Ids appear in server output only in development (07).

### The template object

```ts
interface TemplateObject {
  readonly id: string;
  readonly html: string; // normalized template HTML, bound attributes removed
  readonly parts: readonly PartSpec[]; // see 02 for kinds
  readonly server: boolean; // contains document-level tags (<!doctype>, <html>, <head>, <body>)
  readonly segments?: readonly Segment[]; // the server's writing plan (06); not in client builds
  readonly loc?: string; // development only: file:line:column of the call site
}
```

`segments` (Phase 1, extended in Phase 4) is the template HTML split at its holes: static
strings and one op per hole, plus `open`/`openEnd`/`close` around custom elements (their static
attributes decoded, for props). A child op carries `in`, its parent element's local name
(absent at the template root), so the server can check text in table structure (06).

A `server` template (a page shell) may only be rendered by `@gyral/core/server`. Rendering one
in the browser is an error.

## Two ways to get a template object

### Compiled (default: the Vite preset, production builds)

- `gyralVitePreset` adds the template compiler. In `vite build` it rewrites every `html` tagged
  template, including those in dependencies, into an internal call that takes a hoisted,
  module-level template object and the values array. The result type is the same.
  - The call is `compiled(template, values)`, imported from `@gyral/core/compiled`: an
    internal entry point, not API, so compiled code shares the package copy of the `html` it
    replaces. One constant per distinct template id per module.
  - The hoisted object is the normalizer's output without `loc`; client builds also drop the
    server `segments`, SSR builds keep them.
  - Call sites are found by scope-aware analysis of each module (TypeScript included, before
    it is compiled away): `html\`…\``or`ns.html\`…\``where`html`is imported from`@gyral/core`. Any other use (an alias, a call, a destructured namespace) is a build error
    with a code frame.
  - Template rule errors fail the build with the rule's message and a code frame at the call
    site; two different templates with one id fail it too.
- The compiler builds paths from its own token stream. That is safe because markup the HTML
  parser would repair is a build error (09, rule 7), checked with parse5 as a **build-time-only**
  dependency: an optional peer of `@gyral/core`, loaded by the compiler only. Without it the
  build prints a one-time notice and relies on the normalizer's structural check.
- The preset sets the `gyral-compiled` resolve condition in `vite build` (every environment,
  appended to the app's conditions or to Vite's defaults), which maps core's `#prepare` import
  to a stub. The runtime preparer is then absent from the bundle.
- **Guarantee:** the build fails if any uncompiled `html` call remains in the client output, so
  the stub is never reached in production. Besides the per-module errors above, the compiler
  checks the bundle: if the `html` export of core's template module survives tree-shaking
  (reached through a re-export or a dynamic import it can't follow), the build fails.
- SSR builds keep externalized dependencies out of the bundle; Node runs those with the
  runtime normalizer (no condition applies outside the bundler), which yields the same ids.
- The dev server uses the runtime path, where the development checks live. The compiler can run
  in dev too, but it isn't required.

### Runtime (no build step, the dev server, Node, tests)

- First render of a call site: run the normalizer, then let the **browser's own parser** build
  the DOM (`innerHTML` of a `<template>` element) and compare that whole parse with the shape
  the normalizer expects. A difference means the browser repaired the markup: rule 7.
- Cached in a `WeakMap` keyed by the strings array, which is unique per call site.
- Costs about 9–10 KB gzip of preparer code (measured in Phase 1: tokenizer, tree builder, repair
  rules, whitespace, ~2 KB of messages) plus about 50 µs per template, once. The compiled path
  costs 0.84 KB. Production builds made with the preset don't pay the preparer; the size budget
  measures builds made with the preset. Messages may later move behind the `development`
  condition.
- Node and the server renderer never parse HTML: they only need the normalizer's output.

Both paths produce identical ids, so a precompiled server and a runtime client (or the reverse)
hydrate each other.

## Instantiation

- Each template object gets one `<template>` element, created on first use.
- Single-root templates clone only the root node. Instances are created with
  `document.importNode(template.content, true)`, not
  `template.content.cloneNode(true)`: nested custom elements are created in the document and
  upgraded at once, so parts set props on upgraded elements (05, upgrade capture).
- Parts are found by following paths with `firstChild`/`nextSibling`, sharing prefixes between
  consecutive parts. No TreeWalker, no marker search at instantiation time.

## Native primitives

| Need                   | Primitive                                     | Baseline                                                       |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Parse markup (runtime) | `<template>` + `innerHTML`                    | widely (since 2018)                                            |
| Instantiate            | `document.importNode(content, true)`          | widely                                                         |
| Find parts             | Child-index paths, `firstChild`/`nextSibling` | widely                                                         |
| Parse markup (server)  | none on the server                            | JS tokenizer (no client cost)                                  |
| Future: native parts   | DOM Parts / template instantiation            | not shipping; keep the part table simple enough to map onto it |

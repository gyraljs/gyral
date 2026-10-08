# 01 — Templates

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018. Phases 1 (normalizer, runtime path)
and 6 (compiler).

## Authoring

Views are written with the `html` tag, imported from `@gyral/core`, on the server and in the
browser alike:

```ts
view: (s, i) => html`<button data-intent=${i.Increment}>Count: ${s.count}</button>`;
```

Inline `<svg>` markup inside `html` is parsed by the HTML parser as SVG (foreign content), so
icons and charts are written with `html`. An SVG fragment that is a template of its own (a
`<path>` or `<g>` shown conditionally or per list item inside an `<svg>`) uses the second tag,
`svg` (below). An `html` template whose top level is SVG-only content (`<g>`, `<path>` without
an `<svg>` around them) is an error that points to `svg` (09, rule 10).

### svg templates (0.3.1, gyral-c5d.8)

Dropped in 0.3.0 (ADR 0018), back in 0.3.1 for a real need (sabacc.starwars.run): small SVG
fragments (status marks, labels) rendered as their own templates. Without `svg`, every variant
had to be inlined in one `<svg>`, the unused ones hidden with `display="none"`.

```ts
import { html, nothing, svg } from '@gyral/core';

const mark = (status: string) => svg`<path class=${status} d="M0 0h4v4z" />`;
view: (s) =>
  html`<svg viewBox="0 0 10 14">
    ${s.status === undefined ? nothing : mark(s.status)}
    <text x="1" y="13">${s.name}</text>
  </svg>`;
```

- An `svg` template's top level is **SVG content**, as if it stood inside an `<svg>`: its
  elements are SVG elements, self-closing tags (`<path />`) are allowed, and element and
  attribute names keep SVG's camelCase (`clipPath`, `linearGradient`, `viewBox`). It is
  normalized with the same rules (09), except rule 10's `html` half: instead, HTML at its top
  level (`<div>`, `<p>`, `<button>`, a doctype) is a rule 10 error that points to `html` and
  `<foreignObject>`. HTML inside `<foreignObject>` follows the HTML rules as usual.
- It renders **only inside SVG content**: a child hole of an SVG element other than
  `<foreignObject>`, `<desc>` and `<title>` (whose content is HTML), in an `html` or `svg`
  template, or an `each` row or array item there. Anywhere else (an HTML element, a
  component's root) the parser would not create SVG elements from the server's markup, so it
  is a development error, on the client and on the server (development checks only;
  production writes it as is). A whole graphic, `<svg>` included, is an `html` template.
- `<foreignObject>` holds HTML: `html` templates go in its holes, not `svg` ones.
- The template object carries `svg: true`, and the template id is computed with that flag (the
  same strings make a different DOM as `html`). The normalizer takes it as an argument
  (`analyze(strings, loc, svg)`); the server writes the HTML as is inside the parent's `<svg>`
  (06); the client parses it inside an `<svg>` and keeps that element's children (below).
- **Native primitive:** the HTML parser's own foreign-content rules (WHATWG HTML, "parsing
  main inside foreign content"), reached by parsing inside an `<svg>` element. No
  `createElementNS` builder: the browser creates the nodes with their namespace, adjusted
  names and namespaced static attributes (`xlink:href="#a"`).
- **Only apps that use it pay:** `svg` results prepare their own `<template>` element
  (`svgTemplate` in template-element.ts, about 0.2 KB minified with `compiledSvg`), so
  `templateElement` is unchanged and apps without `svg` templates carry none of it (every
  example's bundle size is unchanged, ±a few bytes of module order).

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

1. **Minify whitespace** (rules below). Binding positions never move: the strings keep their
   count, so holes line up.
2. **Tokenize** the minified strings with an HTML tokenizer state machine (data, tag name,
   attribute name, attribute value in double/single/no quotes, comment, raw text for `<script>`
   and `<style>`, escapable raw text for `<textarea>` and `<title>`) and build the tree. The
   state at each hole decides its kind (02) or a rule violation (09).
3. **Emit the template HTML** for the client: static markup with every bound attribute removed
   and every child hole replaced by nothing, or by an anchor comment where the anchor rule
   needs one (02). The emitted HTML is also exactly what the server writes around values (06).
   A `server` template (a page shell) gets no anchors: it is never hydrated or rendered in the
   browser. **One exception** (0.3.1, gyral-dyn.5): a static `style` attribute leaves the
   client HTML and becomes a part-table entry, a multi-attribute whose only string is the
   decoded value (`[MULTI_PART, path, 'style', ['color: red']]`, no values), which the client
   applies through the CSSOM when it creates the instance (02 "Style attributes"). Firefox
   blocks a `style` attribute in a `<template>`'s HTML under a strict CSP; the CSSOM write is
   allowed. The server segments keep the attribute as written, so server output is unchanged
   and hydration adopts it like any multi-attribute. Page shells and the content of a nested
   `<template>` (which no part reaches) keep theirs. Only templates with a static style pay:
   about a dozen bytes per attribute in the part table; the runtime handles the entry with the
   multi-attribute code it already has.
4. **Build the part table:** one entry per hole, in source order: kind, the path to its element
   (or to its parent element and position for child holes), the attribute name and static
   strings for attribute holes; a child hole's kind also says whether it is its parent's only
   child node (`sole`). Paths are child-index paths from the template's content root. Entries
   are compact tuples (below).
5. **Compute the template id** from the minified strings (step 1).

### Whitespace

Carried over from ADR 0016's addendum (it is Gyral's own design), plus the head-only rule
(2026-10-06, found on gyral.dev's page shells):

- Whitespace-only text that contains a newline is removed when it sits next to a template edge,
  a block-level tag, or the inside edge of `<button>`/`<select>`/`<svg>` (`<svg>` since 0.3.1:
  SVG content renders no text outside its text elements, so a fragment's hole on its own line
  inside an `<svg>` gets no text nodes or anchor around it). Between two inline neighbours (phrasing elements, custom elements,
  holes, comments) it collapses to one space.
- Head-only tags count as block-level edges: `<head>`, `<meta>`, `<link>`, `<base>` and
  `<title>` are never rendered, so never inline. Inside `<head>` (until `</head>` or `<body>`),
  whitespace-only text is always removed, newline or not, also between two holes.
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
- **Not in production client builds** (gyral-g1r.22, 2026-10-06). After the compact form
  (below), ids were about a fifth of the compiled templates' gzip size: random base-36 text
  doesn't compress. The compiler leaves `id` out of the hoisted objects when the client
  environment resolves core's `#view-dev` to its production module (the `development`
  condition isn't listed, and Vite's `development|production` resolves to production), so
  exactly the builds whose renderer has no development checks. SSR builds and development
  builds keep it: development markers and their hydration check, collision checks, server
  output. The runtime path keeps it too (it is computed anyway).
- Without ids the client renderer compares template objects by **identity**: compiled objects
  are hoisted module constants (one per template per module), so a call site always yields the
  same object. Where an object has an id (the runtime path, development builds) another
  object with the same id is the same template, as before; that also keeps an instance across
  a module reloaded in development. One difference follows (02 "Child values"): the same
  markup at call sites in two modules is two objects, so switching between them replaces the
  instance instead of patching it. Hydration in such a build is structural only, which is
  already the production rule (07).
- Measured on the corpus and every example: ADR 0018 "Template ids out of production client
  builds".

### The template object

```ts
interface TemplateObject {
  readonly id?: string; // absent from production client builds ("Template ids")
  readonly html: string; // normalized template HTML, bound attributes removed
  readonly parts: readonly PartSpec[]; // compact tuples, below; see 02 for kinds
  readonly server?: true; // only when it has document-level tags (<!doctype>, <html>, …)
  readonly svg?: true; // only for svg templates ("svg templates")
  readonly segments?: readonly Segment[]; // the server's writing plan (06); not in client builds
  readonly loc?: string; // file:line:column of the call site, when known (below)
}

type PartSpec =
  // the first entry is a small number (types.ts names them)
  | readonly [0 /* child at the end */ | 1 /* sole child */, path]
  | readonly [2 /* child */, path, ref] // inserts before the parent's child node `ref`
  | readonly [3 /* attr */ | 5 /* ?bool */ | 6 /* .prop */, path, name]
  | readonly [4 /* multi-attribute */, path, name, strings]
  | readonly [7 /* hook */ | 8 /* textarea/title text */, path];
```

**Compact by design (2026-10-06, found migrating gyral-shop).** Compiled client builds carry
every template object as code, so its form is chosen for size: numeric kinds, tuples instead
of keyed objects, `server` written only when true. The runtime normalizer produces the same
form, so there is nothing to decode: compiled and runtime objects are identical, and the
renderer reads the tuples directly. A decoded format (flat arrays or one string per template,
decoded once at first use) was measured too: it saves somewhat more on large apps (a string
format about 0.4 KiB more gzip on the 208-object corpus), but its decoder (about 0.2-0.3 KiB
gzip) makes every small app's initial chunk larger, and it needs a cache lookup per template.
Measured with the compiler on the corpus (the examples' and packages' templates: 260 call
sites, 208 objects, minified): 47.6 → 35.2 KB raw, 10.53 → 10.17 KiB gzip, ids unchanged.
Every example's bundle got smaller (35-97 B gzip all chunks, 26-75 B initial; hello-world's
initial chunk 8.91 → 8.87 KiB), since the renderer's own checks got shorter too. Ids were then
about a fifth of the corpus' gzip size (random base-36 text doesn't compress), so production
client builds now leave them out ("Template ids").

`loc` is set only when the normalizer is given a call site. The compiler does, for its build
errors, and leaves `loc` out of the objects it emits. The runtime preparer gives the call site
in development ("Source locations" below), so development runtime objects carry it;
production ones never do.

`segments` (Phase 1, extended in Phase 4) is the template HTML split at its holes: static
strings and one op per hole, plus `open`/`openEnd`/`close` around custom elements (their static
attributes decoded, for props). A child op carries `in`, its parent element's local name
(absent at the template root), so the server can check text in table structure (06), and
`svg: true` when that parent is SVG content, where svg templates may render (0.3.1).

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
    server `segments`, SSR builds keep them, and production client builds drop the `id`
    ("Template ids"). It is already compact (above): nothing decodes it at runtime.
  - Call sites are found by scope-aware analysis of each module (TypeScript included, before
    it is compiled away): `` html`…` `` or `` ns.html`…` `` where `html` is imported from
    `@gyral/core`, and the same for `svg`. Any other use (an alias, a call, a destructured
    namespace) is a build error with a code frame.
  - An `svg` call site becomes `compiledSvg(template, values)` (same entry point, flagged
    object). A package listed in `compiler.sources` that re-exports `svg` must export
    `compiledSvg` too, as it exports `compiled` for `html`.
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
  checks the bundle: if the `html` or `svg` export of core's template module survives
  tree-shaking (reached through a re-export or a dynamic import it can't follow), the build
  fails.
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

### Source locations (development, 0.3.1, gyral-g1r.24)

Decision F promised development errors with the template's source location. Runtime templates
know their call site in development, so a `TemplateError` (`at src/cart.ts:12:5`) and a
`HydrationMismatch` (`(template at src/cart.ts:12:5)`) name it:

- **Recorded once per call site** (strings array, `view/loc.ts`), before the first preparation,
  which passes it to the normalizer (`analyze(strings, loc)`).
- **Under Vite** (the dev server and Vitest, i.e. `vite serve`): the preset's
  `gyral:template-locations` plugin (serve only, `enforce: 'pre'`, loaded lazily like the
  compiler, `compiler/locate.ts`) rewrites each `html` call site of the template sources into
  `(html.at?.("src/cart.ts:12:5") ?? html)`…``: the author's own file (relative to the Vite
  root), line and column, which Vite's transformed modules no longer have (TypeScript stripping
  reprints the code). No line moves; `html.at` exists only in development, so the `??` keeps the
  rewrite harmless anywhere else. Templates in `node_modules` and uses it can't follow (an
  aliased `html`) are left alone. `svg` call sites get the same rewrite with `svg.at`.
- **Elsewhere** (no build step, other bundlers' dev servers, Node): the first `html` (or `svg`)
  call of a call site reads it from `new Error().stack` (V8, SpiderMonkey and JavaScriptCore frame
  formats; scheme, host, query and Vite's `/@fs` dropped). Exact for code the browser runs as
  written; shifted for code a tool transformed without keeping lines.
- **svg templates** are prepared on their first call (above), after the location is recorded,
  so their rule 10 errors and their hydration mismatches name the `svg` call site too.
- **Production pays nothing:** every step is behind `if (DEV)` (`#view-dev`), `html.at` and
  `svg.at` are attached only in development, and `pnpm size` is unchanged. Compiled templates carry no `loc`
  in any build (development builds made with `vite build --mode development` included; the
  compiler could add it, but no workflow needs it: the dev server uses the runtime path).
- Tested in `core/test/view/source-location.test.ts` (both messages name this test file's
  line and column), `source-location.prod.test.ts` and `loc.node.test.ts` (stack formats).

Both paths produce identical ids, so a precompiled server and a runtime client (or the reverse)
hydrate each other. A production client build carries no ids and hydrates any server's output
structurally (07).

## Instantiation

- Each template object gets one `<template>` element, created on first use. An svg template's
  is created when its first result is made: `innerHTML = '<svg>' + html + '</svg>'`, then the
  `<svg>`'s children replace it in the content, so every node is in the SVG namespace (the
  development runtime then checks the parse as for `html`, rule 7).
- A template with one root node and no root-level holes clones only that node. Instances are
  created with `document.importNode(template.content, true)`, not
  `template.content.cloneNode(true)`: nested custom elements are created in the document and
  upgraded at once, so parts set props on upgraded elements (05, upgrade capture).
- Parts are found by following paths with `firstChild`/`nextSibling`, sharing prefixes between
  consecutive parts. No TreeWalker, no marker search at instantiation time.
- **Trusted Types** (0.3.1, gyral-ei9): the HTML is assigned through one Trusted Types policy
  named `gyral` (`view/trusted-html.ts`), created on first use where the browser has
  `trustedTypes`, so a document whose CSP says `require-trusted-types-for 'script'` still
  parses templates. The policy passes the text through unchanged: a template's HTML is the
  author's own strings with markers for the holes, never a value. `raw()` (02) parses through
  the same policy. An app that names its allowed policies lists it:
  `trusted-types gyral` (plus its own). Without Trusted Types the string is assigned as before.
  Tested in Chromium, Firefox and WebKit by `core/test/view/trusted-types.test.ts`, in a
  document where a bare string assignment is refused.

## Native primitives

| Need                   | Primitive                                     | Baseline                                                       |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Parse markup (runtime) | `<template>` + `innerHTML`                    | widely (since 2018)                                            |
| Instantiate            | `document.importNode(content, true)`          | widely                                                         |
| Find parts             | Child-index paths, `firstChild`/`nextSibling` | widely                                                         |
| Parse markup (server)  | none on the server                            | JS tokenizer (no client cost)                                  |
| Future: native parts   | DOM Parts / template instantiation            | not shipping; keep the part table simple enough to map onto it |

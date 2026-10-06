# 06 — Server rendering

Status: **accepted** (2026-10-06), implemented in Phase 4 (gyral-g1r.9; deviations and
implementation notes marked "Phase 4"). ADR 0018. Replaces the Lit parts of ADRs 0012 and 0014.

## What changes

The server knows every component's spec, so rendering a component is just
`view(init(props))` written as text. There is no fake DOM, no element instances, no HTML parser
and no VM: the renderer walks template objects (01) and writes strings.

- No `@lit-labs/ssr`, no DOM shim, no parse5 at runtime.
- Light DOM and Declarative Shadow DOM are both native output modes, so ADR 0014's stream filter
  and hidden markers go away.
- Runtime-agnostic: no Node-only APIs (WebCrypto, not `node:crypto`; no `Buffer`), so it runs in
  Node, Deno and Workers alike.

## API (`@gyral/core/server`)

```ts
render(value: ChildValue, options?: { dev?: boolean }): Iterable<string>; // synchronous chunks
renderToString(value: ChildValue, options?: { dev?: boolean }): string;
styleHashes(): Promise<readonly string[]>; // 'sha256-…' for every registered component (08)
styleHash(text: string): Promise<string>; // the same hash for any <style> text (Phase 4)
StoreRegistry, withStoreScope; // re-exported for @gyral/ssr's per-request scope (Phase 4)
```

- **Phase 4:** each call first registers the specs `define()` recorded outside the browser
  (`registerRecordedSpecs()`, only the new ones) and the `<gyral-stores>` provider, so
  importing a component's module is all an app does. The entry is `packages/core/src/server.ts`;
  the renderer is `view/server/` (it imports only `view/`). Client bundles never import it:
  checked by building the SSR examples' client entries and searching them for the renderer's
  strings.

- **Synchronous.** State is known before rendering (init is pure; data is loaded by the app or
  a form action first), so nothing in a template is awaited. A `Promise` value is an error.
- **Chunked.** `render` yields at least at every component boundary. `@gyral/ssr`'s
  `renderToStream`/`renderPage` pull chunks into a `ReadableStream` and run each pull inside
  the request's store scope, so ADR 0013's per-step isolation keeps working unchanged.
- `@gyral/ssr` keeps `page()`, `renderToStream`, `renderPage`, `storeSeed`, `documentStyles`,
  static generation and form actions. `serverHtml` is gone: `page()` is written with core's
  `html` (page templates are `server` templates, 01).

## Writing a template result

The server writes the template HTML (01), putting each value in at its hole:

| Hole            | Written                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| child           | The value per 02's child table, then the anchor comment if the template has one there |
| text content    | Escaped text inside `<textarea>`/`<title>`                                            |
| attribute       | ` name="escaped"`, or nothing for `null`/`undefined`/`nothing`                        |
| multi-attribute | ` name="…"` with the pieces joined, or nothing if any piece is `nothing`              |
| boolean         | ` name` when truthy (form-state names included, 02)                                   |
| property        | Nothing in markup. On a Gyral component it becomes a prop; elsewhere it is dropped    |
| hook            | The hook's `server(args)` attributes, if it has a server half                         |

- Lists: rows one after another, **no markers** (03). Empty strings and `nothing` write
  nothing; hydration creates what it needs (07).
- `raw(html)`: an anchor comment, then the string verbatim (02).
- **Escaping:** text escapes `&`, `<`, `>`; double-quoted attribute values escape `&` and `"`;
  the seed attribute is single-quoted and escapes `&` and `'` (below).
- Per template, the renderer caches the template HTML split at its holes, keyed by template id.
  **Phase 4:** that split is the template object's `segments` (01), already cached with the
  template object (per call site, or a compiled module constant), so the renderer keeps no
  cache of its own. Child segments carry `in`, the parent element's name (absent at the
  template root), for the table check below.
- **Phase 4, `?indeterminate`:** writes nothing on any element (there is no such attribute).
  `textarea`/`title` content follows the client's flattening exactly (objects as `String(v)`,
  with the development warning).

### How the walk streams (Phase 4)

The walk is plain recursion over segments that appends to one string. When it meets a Gyral
component it writes the start tag and its attributes, then **defers** the rest (seed, shadow
root, view): the walk's result is strings with deferred components between them. `render`
keeps a stack of these; each iterator step yields the next string, expanding a deferred
component (running its `init`, `initialMessages` and view, then walking the view, deferring
nested components again) when it reaches one. So:

- every component boundary is a chunk boundary, and a component's `init` and view run in the
  step that writes it, inside whatever scope the caller set for that step (ADR 0013);
- markup without components costs no generator overhead: a 1,000-row benchmark table (the
  js-framework-benchmark row template, `each` with `pick`) renders in 0.2 ms to a string and
  1.3 ms including UTF-8 encoding (Node 24, median of 101; 226 KB), against 24–28 ms and
  349 KB for 0.2's Lit SSR (`@gyral/ssr` on `main`, same rows with `repeat`);
- a provider's scope is passed down explicitly (`ServerRenderInput.scope`, 05), not set as a
  global around its subtree, because the subtree can span several steps.

### Errors (Phase 4)

Always (the markup would be wrong otherwise):

- a `Promise` in any hole (child, attribute, text content);
- a template object without `segments` (compiled for the client);
- children inside a light component's tag (whitespace-only children are dropped);
- an attribute name from a hook's server half that would break the start tag.

In development (`dev`):

- non-whitespace text or a number written directly in `<table>`, `<tbody>`, `<thead>`,
  `<tfoot>` or `<tr>`, also as the root-level value of a nested template, list or array
  there: the parser would foster-parent it out of the table, so the page would differ from
  the client's DOM (rule 7). Static text at a nested template's root is not checked;
- other objects in child holes, non-hooks in hook holes, bad or duplicate `each` keys;
- warnings, once per call site: `true` in a child hole, objects in attributes or text content.

### Development markers

With `dev: true` (the default when not in production), each template instance is preceded by a
comment carrying its id: `<!--gyral:ID-->`. Development hydration checks them (07). Production
output has none, so production markup is exactly the template HTML plus values.

**Phase 4:** "not in production" is core's `#view-dev` flag, the same one the client uses: on
with the `development` export condition (Vite's dev server and its SSR module runner, Vitest),
off for plain `node`/`tsx`/bundled servers. No `process.env` is read (runtime-agnostic); the
`dev` option overrides it, and also turns the development checks on or off. `server`
templates (page shells) get no marker: they are never hydrated. A component's root starts
with its view's marker (right after the `<style>`, or after a light host's start tag).

## Components

When a start tag's name is in the server registry (05), the renderer renders that component in
place:

1. **Props** come from the tag's static attributes and attribute/boolean holes (parsed and
   validated as in the browser, 05) and its property holes (values as is; validated in
   development).
2. **State** is `init(props)`'s state. Commands are dropped: the client's `init` starts them
   after hydration (ADR 0012). `initialMessages`, if set, run through their reducers.
3. **View:** `view(state, intents, ctx)` with the request's store scope for `ctx.read`.
4. **Output:**

```html
<!-- shadow (default) -->
<shop-cart sku="a1" data-gyral-seed='{"props":{"lines":[…]}}'>
  <template shadowrootmode="open"
    ><style>
      …component CSS…</style
    >…view…</template
  >
</shop-cart>

<!-- light (shadow: false) -->
<shop-listing data-gyral-light data-gyral-seed='{"props":{}}'>…view…</shop-listing>
```

- **Seed** (ADR 0012, kept): `props` that no attribute carries (property holes) and `state`
  unless it equals `init(props)`'s state. Single-quoted JSON, so its double quotes stay raw.
  The JSON-hazard check runs in development.
- **Phase 4:** `.initialMessages=${[…]}` on a component is passed as `initialMessages`, not
  as a prop. Attribute order: the tag's own attributes, then `data-gyral-light` (light),
  `data-gyral-seed`, then `defer-hydration data-gyral-hydrate="…"` (islands). A shadow
  component's CSS texts are written as **one** `<style>` (joined with newlines, `</style`
  escaped as `<\/style`), omitted when it has none; that exact text is what `styleHashes()`
  hashes. Nested components are never deferred (07); only islands get `defer-hydration`.
- **Islands:** a `hydrate` strategy other than `load` adds `defer-hydration` and
  `data-gyral-hydrate="idle|visible|interaction"` (07).
- **Children** written inside a shadow component's tag by the parent come after the
  `<template>` (light-DOM children for slots). A light component owns its children, so children
  given to one are an error (ADR 0014).
- Custom elements that aren't Gyral components are written as plain elements.
- The stores provider (`<gyral-stores>`, ADR 0013) is rendered by the server renderer like any
  element. Its behaviour is unchanged. **Phase 4:** it is a registered _provider_ (05,
  `registerServerProvider`): written as a plain element plus
  `data-gyral-stores="…"` (the states of its `.instances`, when there are any), and its
  registry is the scope of every component inside it, across shadow roots.

## CSP

`styleHashes()` hashes each registered component's CSS text (SHA-256, WebCrypto) once. The page
helper in `@gyral/ssr` adds them to the `Content-Security-Policy` header's `style-src`, so DSD
`<style>` elements work without `'unsafe-inline'` (08).

**Phase 4, the API:** hashing is asynchronous (WebCrypto) and `renderPage` returns its
`Response` synchronously, so the policy is built first and passed in:

```ts
const csp = await contentSecurityPolicy({ styles, directives: { 'default-src': "'self'" } });
return renderPage({ title, body, styles, csp }); // sets Content-Security-Policy: csp
```

`contentSecurityPolicy({ styles?, directives? })` (`@gyral/ssr`) returns the header value:
the given directives, and `style-src` = the given one (default `'self'`) plus the hashes of
every registered shadow component's `<style>` and of each `page({ styles })` entry (as
written, `</style` escaped). Hashes are cached per text, so building it per request is
cheap. `style` attributes and hand-written `<style>` elements in `head` are not covered.
Verified (Phase 4) with a real header in Chromium 153, Firefox 155 and WebKit 26.6: a hashed
`<style>` in a declarative shadow root applies, an unhashed one is blocked, and adopted
constructed sheets are not affected (`style-src` doesn't apply to them). The Chromium case is
a test (`core/test/view/server-csp.test.ts`).

## Conformance (Phase 4)

`core/test/view/server-conformance.test.ts` runs README property 1 with fast-check: generated
results (nested templates, `each` lists, arrays, single/multi/boolean attributes with
`null`/`nothing`, text with markup characters, `raw()`, live form state, tables, shadow and
light components with property props and slotted children), rendered by the client into a
fresh root and by the server, parsed with `setHTMLUnsafe` into a document without a browsing
context (declarative shadow roots attached, nothing upgrades), must give the same canonical
DOM: adjacent text merged, development markers, server-only attributes and the shadow root's
`<style>` ignored, form state compared by live property. Chromium's `Document.parseHTMLUnsafe`
drops comments, so it can't be used for this. Generated templates avoid a `<p>` around nested
block content: the parser closes the `<p>`, a rule-7 repair that the normalizer only sees
within one template.

## Native primitives

| Need                  | Primitive                            | Baseline                   |
| --------------------- | ------------------------------------ | -------------------------- |
| Shadow roots in HTML  | `<template shadowrootmode="open">`   | widely (since 2026-08-20)  |
| Style hashes          | `crypto.subtle.digest('SHA-256', …)` | WebCrypto, server runtimes |
| CSP for inline styles | `style-src 'sha256-…'`               | widely (CSP)               |
| Streaming             | `ReadableStream` (in `@gyral/ssr`)   | server runtimes            |

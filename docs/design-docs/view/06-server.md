# 06 — Server rendering

Status: **accepted** (2026-10-06). ADR 0018. Phase 4. Replaces the Lit parts of ADRs 0012 and 0014.

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
```

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

### Development markers

With `dev: true` (the default when not in production), each template instance is preceded by a
comment carrying its id: `<!--gyral:ID-->`. Development hydration checks them (07). Production
output has none, so production markup is exactly the template HTML plus values.

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
- **Islands:** a `hydrate` strategy other than `load` adds `defer-hydration` and
  `data-gyral-hydrate="idle|visible|interaction"` (07).
- **Children** written inside a shadow component's tag by the parent come after the
  `<template>` (light-DOM children for slots). A light component owns its children, so children
  given to one are an error (ADR 0014).
- Custom elements that aren't Gyral components are written as plain elements.
- The stores provider (`<gyral-stores>`, ADR 0013) is rendered by the server renderer like any
  element. Its behaviour is unchanged.

## CSP

`styleHashes()` hashes each registered component's CSS text (SHA-256, WebCrypto) once. The page
helper in `@gyral/ssr` adds them to the `Content-Security-Policy` header's `style-src`, so DSD
`<style>` elements work without `'unsafe-inline'` (08).

## Native primitives

| Need                  | Primitive                            | Baseline                   |
| --------------------- | ------------------------------------ | -------------------------- |
| Shadow roots in HTML  | `<template shadowrootmode="open">`   | widely (since 2026-08-20)  |
| Style hashes          | `crypto.subtle.digest('SHA-256', …)` | WebCrypto, server runtimes |
| CSP for inline styles | `style-src 'sha256-…'`               | widely (CSP)               |
| Streaming             | `ReadableStream` (in `@gyral/ssr`)   | server runtimes            |

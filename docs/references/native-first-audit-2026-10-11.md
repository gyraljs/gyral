# Native-first package audit — 2026-10-11

Completed against the 0.3.1 `next` implementation at `78052c4` for gyral-m56. The view-layer
swap is implemented; npm release approval does not block reviewing native primitives.
Policy: [ADR 0003](../design-docs/0003-browser-baseline.md) and
[ADR 0018](../design-docs/0018-view-layer.md). Reviewed every package's `src/` modules,
including server, build-time and testing entries; this table records the resulting choices.

## Package findings

| Package           | Native primitives and decisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gyral/core`     | Custom elements, Shadow DOM, `<template>` parsing/cloning, DOM range/node operations, delegated events, `queueMicrotask`, `requestAnimationFrame`, `AbortController` and constructable stylesheets already supply the platform work. Replace the scheduler's externally captured promise executor with `Promise.withResolvers()` (gyral-8ml). The normalizer/compiler enforces Gyral's template grammar and computes binding paths: the HTML parser does not supply those. Store/reducer interpretation and keyed reconciliation have no equivalent browser API. |
| `@gyral/http`     | `fetch`, `URL`, `Headers`, `FormData`, `URLSearchParams` and `AbortSignal.any()` already supply request and cancellation primitives. Keep the explicitly cleared HTTP timeout: `AbortSignal.timeout()` cannot cancel its timer and bypasses virtual time. Schema validation and typed error mapping are application boundaries, not platform polyfills.                                                                                                                                                                                                          |
| `@gyral/time`     | `setTimeout`, `setInterval`, `Date.now()`, `performance.now()` and animation frames already implement time. A successful delay resolves rather than aborts, so `AbortSignal.timeout()` is not a replacement. Keep the frame timer in workers/Node: animation frames are a document capability, not an age-based browser fallback. Fix completed delay listener retention and cancellation during stream emission (gyral-t64). Promise executors around callback registration remain appropriate.                                                                 |
| `@gyral/router`   | `URL` supplies parsing/encoding; `URLPattern` and the Navigation API are native enhancements. Keep the URLPattern matcher and lazy History implementation until their recorded dates. The constrained matcher and typed route builders preserve matching parity; browser APIs do not provide Gyral's message stream, head updates or rendering-aware focus policy.                                                                                                                                                                                               |
| `@gyral/ssr`      | `Response`, `ReadableStream`, `Headers`, `TextEncoder` and `URL` supply the runtime-agnostic server boundary. Node serving uses Node HTTP/filesystem primitives only in its separate entry. Keep synchronous SHA-256: WebCrypto `digest()` is asynchronous, while `renderPage()` must return a response with its CSP header synchronously. Chunk pulling and request-local stores are Gyral behavior, not substitutes for a native renderer.                                                                                                                     |
| `@gyral/testing`  | Replace recording fakes' deferred promise executor with `Promise.withResolvers()` (gyral-8ml). Keep fake timers: native timers cannot advance virtual time. Browser SSR mounting uses `setHTMLUnsafe()` to reproduce parser-created declarative shadow roots; `innerHTML` would not create them. This test helper requires a supporting test browser; it is not an app fallback. `settled()` observes Gyral work, not just custom-element registration.                                                                                                          |
| `@gyral/devtools` | `queueMicrotask` batches the event feed, `performance.now()` timestamps it, native keyboard events control it, and the panel uses Gyral components. No promise-deferred implementation or removable platform fallback found. Cycle-safe, secret-redacting previews cannot use `structuredClone()` in place of their JSON display policy.                                                                                                                                                                                                                         |
| `create-gyral`    | Node filesystem/path APIs and process spawning perform scaffolding. Templates use the public packages. Package-manager discovery and name validation are CLI policy, not browser fallbacks. No removable primitive implementation found.                                                                                                                                                                                                                                                                                                                         |
| `@gyral/mcp`      | Node file reads and native `fetch` already load the corpus; `AbortSignal.timeout()` fits a short Node-only refresh deadline. Falling back to the bundled corpus is an offline behavior, not a browser-support fallback. SDK protocol handling is outside core. No removable primitive implementation found.                                                                                                                                                                                                                                                      |

## Availability and retained fallbacks

Dates are from the immutable `web-features` **3.35.0** snapshot used by ADR 0003. Its status
strings are a historical snapshot; widely-available dates below are newly available plus
30 months. Current MDN pages were also checked on 2026-10-11.

| Primitive                           | Newly available | Widely available | Result                                                                                                                             |
| ----------------------------------- | --------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Promise.withResolvers()`           | 2024-03-05      | 2026-09-05       | Use directly; add its TypeScript library declaration.                                                                              |
| `AbortSignal.any()`                 | 2024-03-19      | 2026-09-19       | Already used directly in HTTP.                                                                                                     |
| `AbortSignal.timeout()`             | 2024-04-18      | 2026-10-18       | Not yet at the browser floor; Node MCP already uses it. Cancellable/virtual timers still have different semantics after this date. |
| Custom states                       | 2024-05-17      | 2026-11-17       | Keep tier-1 detection and legacy-name protection; gyral-m56.4.                                                                     |
| Popover                             | 2025-01-27      | 2027-07-27       | Keep tier-1 detection in modal bindings; gyral-k3v.                                                                                |
| `URLPattern`                        | 2025-09-15      | 2028-03-15       | Keep the constrained matcher; gyral-m56.1.                                                                                         |
| View Transitions                    | 2025-10-14      | 2028-04-14       | Keep detection and reduced-motion handling; gyral-m56.5.                                                                           |
| Invoker commands                    | 2025-12-12      | 2028-06-12       | Keep lazy tier-3 shim; gyral-m56.3.                                                                                                |
| Navigation API                      | 2026-01-13      | 2028-07-13       | Keep lazy tier-3 History fallback; gyral-m56.2. gyral-m56.7 duplicates it.                                                         |
| Trusted Types                       | 2026-02-24      | 2028-08-24       | Keep absence detection; gyral-486. A refused CSP policy remains a separate failure case.                                           |
| `moveBefore`, `requestIdleCallback` | Not Baseline    | Unknown          | Keep inline tier-2 fallbacks; gyral-m56.6 records this release's recheck.                                                          |

The URLPattern fallback shares decoding/segmentation with the native path. A production
minified IIFE measurement of `routes.ts` with both paths was 1,879 B min / 969 B gzip; a
measurement-only build with native matching was 1,639 B min / 883 B gzip. The fallback adds
**86 B gzip**, below the approximately 300 B threshold for lazy loading (gyral-45e). An isolated
exported fallback module was 328 B gzip, including shared helpers and module overhead, so
that figure overstates the incremental cost. Keep the synchronous API and inline matcher.
A larger matcher must be measured before expanding supported syntax.
Neither fallback-removal dates nor worker capability guards justify patching globals.

`setHTMLUnsafe()` is not needed for runtime templates: their `<template>.innerHTML` path
creates inert template content and intentionally does not instantiate declarative shadow
roots. A sanitizer would change trusted-author template semantics and is not a substitute
for escaping dynamic text or validating URLs.

## Sources

- [web-features 3.35.0 data](https://registry.npmjs.org/web-features/-/web-features-3.35.0.tgz)
- [MDN: Promise.withResolvers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers)
- [MDN: AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)
- [MDN: AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- [MDN: moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)
- [MDN: requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
- [MDN: setHTMLUnsafe](https://developer.mozilla.org/en-US/docs/Web/API/Element/setHTMLUnsafe)

# Gyral with Rust servers

Rust owns authentication, approved DTOs, transactions and HTTP response policy in all three
paths. Choose the path from the page's initial HTML and deployment requirements.

| Path                          | Server rendering                                                                 | Browser activation                                         | Suitable boundary                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Rust API and build-time pages | Static generation runs Gyral during the JS build. Rust serves the API and files. | Hydrate generated pages; first-render client-only widgets. | Public stable pages and authenticated application UI. No JS runtime on the server. |
| Askama and client components  | Rust renders templates/native forms, with fallback content. No server JS engine. | Gyral first-renders selected widgets.                      | Multi-page applications where native form submissions must work without JS.        |
| `gyral-rs` embedded SSR       | Bounded Rust workers run the app's real Gyral SSR bundle in deno_core/V8.        | Matching JS hydrates the serialized component DOM.         | Per-request component HTML where an embedded JS engine is an accepted dependency.  |

This path does **not** need `gyral-rs`. A shared browser Effect runtime in such an app is
an application-owned driver adapter, not a Rust renderer. A backend committed write is
authoritative even if a browser request is aborted; a redraw cannot replace authorization.

## Reviewed embedded compatibility

`gyral-rs` is experimental and published on crates.io as `gyral` (front door; the `axum`
feature adds `gyral-axum`) with `gyral-renderer` and `gyral-renderer-domain`. Gyral and
gyral-rs meet at a versioned **SSR protocol** ([ADR 0034](../design-docs/0034-ssr-protocol.md)):
a Gyral release declares the protocol its server code implements, and gyral-rs accepts any
release that declares a protocol it supports, from that protocol's minimum release on. A Gyral
release that keeps the protocol, minors included, needs no gyral-rs release; only a new
protocol does, and it ships in a Gyral minor with an upgrade note.

| Protocol | Gyral releases                                                                       | gyral-rs                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | 0.3.8 and later, no prereleases; `SSR_PROTOCOL` is exported from 0.3.10 (unreleased) | 0.8.0 and later (unreleased). Before 0.8.0 each minor accepted one Gyral release: 0.7.x 0.3.9, 0.6.x 0.3.8, 0.5.x 0.3.7, 0.4.x 0.3.6, 0.3.x 0.3.5 |

The supported embedded target is Linux x86_64 GNU, Rust 1.99.0/edition 2024,
deno_core 0.412.0 and V8 150.4.0. Other targets have no verified support claim. The
coordination fixture, [rust-compatibility.json](rust-compatibility.json), records the protocol
and the gyral-rs release Gyral's CI tests against.

Protocol 1 requires `globalThis.gyralBundleVersion = SSR_PROTOCOL` (`1`; import it from
`@gyral/ssr`, or write `1` before 0.3.10) and `gyralRender({ page, props })` returning a
nonempty HTML string or Promise. `props` is an approved JSON object, limited to 256 KiB; HTML
is limited to 2 MiB and each JS bundle to 8 MiB. The host offers the ECMAScript built-ins,
`Intl`, `queueMicrotask` and `console`, nothing else: no `TextEncoder`, `btoa`, timers, Fetch,
`URL`, `crypto`, DOM, Node or filesystem API. So render with `renderToString` (`renderPage`
returns a Fetch `Response`), and compute `styleHashes()` at build time, in Node. Bundle server
imports into one IIFE (esbuild `platform: 'neutral'`, production); the browser contract uses
one self-contained ESM entry. Split chunks, streaming HTML and dynamic CSS have no
established compatibility.

```js
import { renderToString, SSR_PROTOCOL } from '@gyral/ssr';
globalThis.gyralBundleVersion = SSR_PROTOCOL; // the build writes the same number as `abi`
globalThis.gyralRender = async ({ page, props }) => renderToString(/* the page */);
```

Build browser and server from the same components and the same Gyral release: the HTML,
seeds and hydration format are a contract between one release's server and client code,
outside the protocol, and the manifest's `gyral` field names that one release. Write `abi`
from `SSR_PROTOCOL` in the installed `@gyral/ssr`. gyral-rs 0.8.0 checks `gyral` against the
protocol's minimum (a strict `MAJOR.MINOR.PATCH`); gyral-rs 0.7.x still accepts exactly
**0.3.9**. Verify bundle digests, the hashed client path, SRI and static style hashes before
HTTP startup. Those digests establish matching artifacts against a trusted manifest; they are
not signatures. Rust sends the complete enforcing CSP and Gyral's HTML/seeds unchanged. Never
put server secrets or unauthorized fields in seeds.

## Worker and application ownership

Each renderer owns its execution/watchdog threads and bounded queue. Each request gets a
fresh isolate; request DTOs and globals must not leak into another render. Dropping a render
future cancels queued work or interrupts active JS. Drain HTTP, then explicitly shut down
and join the renderer within the host's shutdown budget. Deadlines and managed-heap limits
bound resource use but do not establish an untrusted-code sandbox or a process RSS ceiling.
Only execute reviewed app bundles.

The snapshot experiment restores fresh isolates from a prepared bundle. It remains test-only.
Full application artifact/lifecycle validation is owned by `gyral-rs-xun.5` in the Rust
repository; fixture throughput is insufficient to claim full-application readiness or framework
performance superiority. Crates are published from the gyral-rs release workflow (crates.io
Trusted Publishing); a new Gyral release needs a gyral-rs release only when it changes the
protocol.

## Reproduce the release fixture

Run `node scripts/verify-rust-compatibility.mjs /path/to/gyral-rs`. It refuses an unreviewed
source revision or changed exact npm pins, uses the Rust repository's frozen installation,
builds both asset pairs and runs its embedded, artifact and real-browser checks. It writes
only ignored local build outputs, never edits manifests or publishes crates. A candidate
Gyral release needs its own reviewed compatibility descriptor and coordinated Rust acceptance;
passing the 0.3.9 descriptor does not certify unreleased Gyral changes.

The fixtures cover real SSR, escaped props, stores, forms, timezones, error recovery,
request isolation, enforcing CSP, no-JS first paint, DOM adoption, typed-before-hydration
inputs, invalid/redacted forms, digest tampering and cleanup. Runtime budget tests cover
cancellation/deadlines/heap/shutdown separately. The Askama example's native CRUD/CSRF/SQLite
tests remain its application acceptance, outside Gyral's framework contract.

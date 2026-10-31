# ADR 0034 — A versioned SSR protocol between Gyral and gyral-rs

Status: **accepted** (2026-10-31), for Gyral 0.3.10 and gyral-rs 0.8.0. Bead: gyral-uvj.1 (epic
gyral-uvj). The owner locked the decisions below on 2026-10-31, each as recommended.

gyral-rs renders Gyral apps by running the app's SSR bundle in deno_core/V8. It accepts a
bundle only when its manifest names exactly one Gyral release (`GYRAL_VERSION`, now `0.3.9`),
so every Gyral patch forces a gyral-rs minor: six in 17 days (0.2.0 to 0.7.0, 2026-10-13 to
10-30), each changing one line of crate source, that constant. 0.6.0 (for Gyral 0.3.8,
released 2026-10-29) and 0.7.0 (for 0.3.9, 2026-10-30) were released one day apart, and the
example rendered byte-identical HTML both times. The pin protects nothing that a contract
version would not, yet it makes every gyral-rs release look breaking and forces Rust apps to
upgrade both projects in lockstep.

## Decision

The server contract becomes a protocol with its own integer version. **Protocol 1 is
today's ABI 1, unchanged.** Gyral declares the protocol its server code implements. gyral-rs
accepts any Gyral release that declares a protocol it supports, at or above that protocol's
minimum release. A Gyral release that keeps the protocol needs no gyral-rs release.

### The protocol 1 surface

| Element          | Protocol 1                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server build     | ESM sources bundled into one classic-script IIFE (esbuild `platform: 'neutral'`, `NODE_ENV=production`); Gyral's exports must resolve under those conditions. No module loader, `import()` or top-level `await`.                                                  |
| Host environment | ECMAScript built-ins of V8 150, `Intl` with full ICU data, `queueMicrotask`, `console`. Nothing else: no `TextEncoder`, `btoa`, timers, `fetch`/`Response`, `URL`, `crypto`, `structuredClone`, DOM or Node globals.                                              |
| Declaration      | `globalThis.gyralBundleVersion`: an unsigned integer, the protocol, read after evaluation.                                                                                                                                                                        |
| Entry            | `globalThis.gyralRender({ page, props })`: `page` matches `[A-Za-z0-9_-]{1,64}`; `props` is a JSON object, at most 256 KiB, passed through `JSON.parse`.                                                                                                          |
| Result           | A nonempty string, or a promise of one, at most 2 MiB: a document or a fragment, passed through unchanged.                                                                                                                                                        |
| Errors           | Throw or reject → `RenderError::JavaScript`. Non-string → `InvalidResult`. Empty or too large → `Contract`. Wrong or missing declaration → `UnsupportedBundleAbi`. Gyral's codes (such as G0078 under `onError: 'throw'`) stay in diagnostics, uninterpreted.     |
| Manifest         | `abi`, `gyral`, `server_sha256`, `client.path`, `client.sha256`, `style_hashes` (at most 32), 16 KiB, unknown fields rejected.                                                                                                                                    |
| Client and CSP   | One self-contained ESM browser entry at `/assets/client.<sha256>.js`, referenced with SRI. Markup needs only what the manifest-derived policy allows: that script by hash, `<style>` texts listed in `style_hashes`, and no inline scripts or `style` attributes. |
| Bundle sizes     | Server and browser bundles at most 8 MiB each.                                                                                                                                                                                                                    |

The host environment was observed, not assumed: a probe bundle run by the gyral-rs 0.7.0
release binary (2026-10-31) saw the ECMAScript globals (V8 150 adds `Temporal`), `console` and
`queueMicrotask`, and none of the excluded names. deno_core's own `Deno.core` and `__bootstrap`
are there too; they are the engine's internals, not part of the protocol, and a bundle must not
use them.

**The HTML is outside the protocol,** except what the CSP must allow (the last rows above).
Seeds, Declarative Shadow DOM, markers and islands are a contract between one Gyral release's
server and client code. gyral-rs never parses them. Protocol 1 therefore requires both bundles
to come from the same Gyral release, and the manifest's single `gyral` field names it.
Hydration format changes (gyral-qqa's `<noscript>` fix in 0.3.10, for instance) are Gyral's
business, tested by Gyral's own suites.

### Declaring the version

- **`abi` is the protocol version.** The field already means "bundle interface version" and
  gyral-rs already versions it separately from Gyral. Every existing manifest says `abi: 1`.
  Renaming it would change the manifest format and buy nothing.
- **`gyral` stays.** It records the release that built both bundles. gyral-rs checks it against
  the protocol's minimum and reports it. It no longer has to match one exact version.
- **Gyral exports `SSR_PROTOCOL`** (`1`) from `@gyral/ssr`, from 0.3.10. A server entry sets
  `globalThis.gyralBundleVersion = SSR_PROTOCOL`, and the build writes `abi` from the same
  installed package. A Gyral release that bumps the protocol then makes the bundle declare the
  new number, so an older gyral-rs rejects it instead of running code it doesn't support. A
  helper that installs `gyralRender` and writes the manifest can come later.

### What changes the protocol

A **bump** is any change that a host built for protocol N could notice:

- The server code needs a global outside the host profile (a style hash computed at render
  time would need `TextEncoder` and `btoa`), or a newer engine than V8 150.
- Its package exports stop resolving into one IIFE under the build profile. gyral-gpr's
  production build, which adds export conditions in 0.3.10, must pass this check.
- `renderToString` changes its result type, its `onError: 'throw'` rejection, or its options
  that embedded entries use (`stores`, `onError`). So does `styleHashes()`'s format.
- Server output starts needing a resource the policy doesn't allow: an inline script, `style`
  attributes (ADR 0020's opt-in stays opt-in), a second script or preload, or external CSS.
- The client stops being one self-contained entry, or a manifest field is added, removed or
  reinterpreted. gyral-rs rejects unknown fields, so even an optional field is a bump.
- The host tightens a limit or drops a promised global. Loosening a limit is not a bump.

**Not a bump:** bug fixes, new APIs, development checks, tooling and dev-server work; changes to
the HTML, seeds or hydration; and template rules that reject templates that were never valid.
Each of 0.3.7, 0.3.8 and 0.3.9 is in this class (see Transition).

A bump breaks embedded apps. It ships in a Gyral minor with an upgrade page and an addendum
here specifying protocol N+1, after a gyral-rs minor that supports N+1.

### Catching an accidental change

A contract test runs in `pnpm check` (`packages/ssr/test/embedded-protocol.node.test.ts`). It
needs no Rust and no download:

1. It bundles a fixture entry (`test/fixtures/embedded/`: a prop, component CSS, a shared
   store, a native form with a schema, a time zone, a failing component, hostile props) with
   esbuild, with the gyral-rs example's options (`tools/build-example.mjs`). esbuild is an exact
   devDependency of `@gyral/ssr`. Unlike the example, the entry installs no `TextEncoder` shim.
2. It evaluates the IIFE in a `node:vm` context holding only protocol 1's host profile
   (`test/support/embedded-host.ts`), so a new global dependency, at load or render time, fails
   as a `ReferenceError`. The test also checks that each excluded global is absent from the
   context and fails a render that needs it.
3. It checks the declaration, the string result and its size, escaping, prototype safety, the
   `onError: 'throw'` rejection (G0078), and the markup's resource needs: no inline script, no
   `style` attribute, and every `<style>` text among `styleHashes()`'s hashes (or the page's
   own CSS), each `'sha256-…'`.
4. It reads the declarations of `SSR_PROTOCOL`, `renderToString`, every `RenderOptions` field
   and `styleHashes` with the TypeScript checker (`test/support/protocol-api.ts`), hashes them,
   and compares the hash with the `apiHash` that `docs/references/rust-compatibility.json`
   records for the protocol. Every field counts, not only `stores` and `onError`, so a new
   option is a decision too, not an accident.

A failure says what changed and asks to undo it, or to bump `SSR_PROTOCOL` and specify the next
protocol, or, when no host can notice it, to confirm it's compatible by recording the new hash.
`SSR_PROTOCOL` differing from the fixture's `protocol` fails too: a bump needs its
specification, a gyral-rs release that supports it, and the fixture pointing at both.

### How gyral-rs accepts bundles (0.8.0)

- `GYRAL_VERSION` gives way to a table of supported protocols, each with its minimum Gyral
  release. 0.8.0 has one entry: protocol 1, Gyral ≥ 0.3.8.
- The manifest's `abi` must be in the table. Otherwise `UnsupportedProtocol { received,
supported }` fails startup before any JavaScript runs. Its message says which gyral-rs
  releases support the newer protocol, with a link to the table in `rust-rendering.md`.
- `gyral` must be a strict `MAJOR.MINOR.PATCH`, parsed without a new dependency. A
  prerelease, or a release below the minimum, fails with `InvalidGyralVersion` or
  `GyralTooOld { received, minimum }`. There is no upper bound: a Gyral 0.4.0 that keeps
  protocol 1 is accepted.
- The worker checks `gyralBundleVersion` against the manifest's protocol, which
  `AppArtifacts` carries, instead of against a constant. The `bundle_abi` telemetry label
  stays.
- **Reporting.** `BundleManifest::protocol()` and `gyral_version()` expose both values; the
  example logs them at startup. Metric labels stay finite; a host may add a build-info gauge.
- **Semver.** Supporting a new protocol, dropping one, or raising a minimum is a gyral-rs
  minor; a new Gyral release on a supported protocol needs no release. 0.8.0 is a minor
  because it removes `GYRAL_VERSION` and changes `ManifestError`'s variants.
- **Adoption is separate from acceptance.** The repository still pins one exact Gyral in its
  lockfile and adopts new ones under ADR 0032's two-week rule.

### Compatibility testing

**In Gyral, on every pull request and push to `main`**, a `rust-compat` job runs in `ci.yml`,
beside the gate (only `ci.yml` may run on those events, ADR 0004). It doesn't go inside
`pnpm check`, because it downloads, and it never compiles Rust. `pnpm rust-compat`
(`scripts/rust-compat.mjs`) runs the same steps locally:

1. It downloads the pinned gyral-rs release's source and Linux binary archives from its
   GitHub release, and checks their SHA-256 against `rust-compatibility.json`.
2. It packs `@gyral/core` and `@gyral/ssr` from this checkout, installs the tarballs into the
   extracted source with the esbuild version gyral-rs pins, and runs the example's own build
   (`tools/build-example.mjs`), as gyral-rs's release does.
3. It starts the released `gyral-axum-example` with `GYRAL_EXAMPLE_DIST` pointing at the fresh
   build, as `tools/release-smoke.mjs` does. It checks `/readyz`, an escaped render with the
   policy's headers, the client asset, the broken page's opaque 500 and a clean shutdown; then
   that a tampered server digest and an unknown protocol (`abi: 2`) fail startup.

It costs two downloads and about a minute, and tests the candidate, not the last npm release.
There is no schedule (ADR 0004). At release time `verify-rust-compatibility.mjs` keeps the
full check on the candidate tarballs: a Rust build of the pinned commit, in a throwaway copy,
and the Chromium/WebKit hydration and CSP suites, without exact npm pins.

**Until gyral-rs 0.8.0 shipped,** the fixture pinned 0.7.0, which accepts exactly Gyral 0.3.9
(`acceptsGyral` in the fixture). The candidate packages carry the version of the last release
until the release commit bumps them, so on every pull request before 0.3.10's the job ran the
candidate's server code in the 0.7.0 binary, labelled 0.3.9, with nothing relabelled, and a
0.3.10 candidate would have failed it, saying to pin a gyral-rs release that accepts protocol 1.
That enforced decision 8 instead of skipping the check. gyral-rs 0.8.0 shipped on 2026-10-31
(`300faf1`), and 0.3.10's release commit pins it.

**In gyral-rs**, a `gyral-canary` job (push, pull requests, and by hand with a version) tests
each supported protocol's minimum release and the newest npm release declaring it: the
renderer's `gyral` test, the artifact smoke and the browser suites. The newest goes into a
throwaway copy with the age gate off; testing a release is not adopting it. Gyral's runbook
gains a step: after npm approval, start this job with the new version.

### Transition

**ABI 1 held across 0.3.7, 0.3.8 and 0.3.9.** In Gyral, `git diff v0.3.6..v0.3.9` leaves
`packages/core/src/view/server/`, `ssr/src/{page,render-stream,components}.ts`, `store-scope.ts`
and `stores-provider.ts` untouched. The other server-path changes: in 0.3.7, template rule 16,
which production server rendering never applies: `vite build` with the preset and ESLint check
it, and the runtime preparer only in development (`prepare.ts`: `DEV ? analyze(…, nameChecks)
: analyze(…)`), so a production SSR bundle, which esbuild builds without Gyral's compiler, runs
the preparer without it. In 0.3.8, `@gyral/ssr`'s load-time `requireCore` (ADR 0033), which
uses only `console.warn`; in 0.3.9, the dev server's `replaceDefinitions()` and a stable
`readProps` reference. None changes `renderToString`, `styleHashes()` or the globals the server
code uses. The contract test's checks agree: the declarations it reads are identical at
`v0.3.8`, `v0.3.9` and 0.3.10's branch, and the fixture renders in the bare host profile from
`v0.3.8`'s and `v0.3.9`'s sources alike (2026-10-31). In gyral-rs, each of `v0.4.0..v0.5.0`,
`v0.5.0..v0.6.0` and `v0.6.0..v0.7.0` changes the same eight lines in seven files: the
constant, four test files and two build scripts. The example's `web/` entries are untouched.
`docs/verification.md` records byte-identical HTML and the same G0078 failure for 0.3.7 against
0.3.8, and for 0.3.8 against 0.3.9. So 0.3.10 declares protocol 1, provided the contract test
passes on its final commit.

**Old manifests need no mapping.** 0.3.8 and 0.3.9 manifests already carry `abi: 1`, and
gyral-rs 0.6.0 and 0.7.0 ran the full fixture against them. gyral-rs 0.8.0 reads them as
protocol 1, so an app can upgrade its crates before it rebuilds its JavaScript. 0.3.7 is left
out even though the evidence covers it. Before ADR 0033, `@gyral/ssr` depended on core and
could bundle a second copy without a word, so `gyral: "0.3.7"` didn't reliably name one
release. Only gyral-rs 0.5.x accepts 0.3.7 today.

**Order.** gyral-rs 0.8.0 ships first, with its example still on 0.3.9. Gyral 0.3.10 then
becomes the first Gyral release that needs no gyral-rs release. The example adopts 0.3.10
under the two-week rule or an owner exemption.

**What changes.**

- **Gyral:** `SSR_PROTOCOL` (public-API inventory, docs), the contract test, the `rust-compat`
  job, and `verify-rust-compatibility.mjs` on candidate tarballs. `rust-compatibility.json`
  becomes schema 2: the protocol (`protocol`, `minGyral`, `apiHash`, `host`, `limits`) plus the
  pinned `gyralRs` release (version, commit and archive digests), with no exact `npm` pin.
  `rust-rendering.md` trades "each gyral-rs minor accepts one Gyral release" for a protocol
  table; `releasing.md` gains the canary step and the bump procedure; the ADR index and
  `ecosystem-review/rust.md`.
- **gyral-rs:** `bundle-contract.md` becomes "SSR protocol 1"; `operations-and-release.md` and
  `releasing.md` step 3 say only a protocol change needs a release. Both example builds read
  the installed version and `SSR_PROTOCOL` (1 below 0.3.10); `check.py` still pins the adopted
  version exactly, apart from any crate constant. README badge, `ARCHITECTURE.md`, a 0.8.0
  changelog entry with a migration note, and a verification record. The example's
  `TextEncoder` shim is no longer needed by Gyral's render path (the contract test runs without
  it); removing it is gyral-rs's call.

### Security and integrity

Every check stays: the 16 KiB bound, rejection of unknown fields, digest syntax, client path
equal to its digest, at most 32 styles, size limits, and server and client digests verified
before execution or serving. The runtime declaration is still checked before `gyralRender`
runs. An unknown protocol still fails closed, now with a clearer message.

Relaxing the exact pin weakens none of this. The digests bind bytes to the manifest; the
version string binds nothing. The same build writes `gyral` and the digests, so anyone able
to forge a manifest could have written `"0.3.9"`. The pin was a compatibility assertion, not
an integrity control. Trust in the Gyral code inside a bundle comes from the app's lockfile:
SHA-512 integrity, npm provenance and ADR 0032's age gate. What changes: gyral-rs no longer
vouches for each release by name; the contract test and CI jobs carry that evidence. To shut
out a Gyral release with a server-side security defect, gyral-rs can raise the minimum.

## Alternatives considered

| Option                         | For                                            | Against                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the exact pin             | The evidence covers every pair; no new work    | A gyral-rs minor per Gyral patch, each signalling a break that isn't one; Rust apps wait for both projects to release                                                                   |
| A semver range on `gyral` only | Simple; no new concept                         | Gyral is 0.x and its patches don't track the server contract. The range guesses about future releases, accepts a contract change silently, and can't admit a 0.4 that kept the contract |
| Capability negotiation         | Fine-grained, additive evolution without bumps | One function's contract doesn't need it. It makes the test matrix combinatorial, and failures move from startup to request time. It can be added later inside a protocol version        |

## Costs and risks

- **Costs.** Gyral: the contract test, an exact esbuild devDependency, a CI job that downloads
  two release archives per run, and the discipline to bump. gyral-rs: a breaking 0.8.0,
  version parsing, the canary job. Both: the document changes above.
- **A gap in the contract test.** A semantic change it doesn't model, such as escaping, could
  slip through; the `rust-compat` job, the release fixture and the canary render real pages.
- **Untested pairs.** Evidence becomes "the protocol held", not "this pair was tested". The
  canary covers each protocol's minimum and newest release; pairs between rest on the test.
- **A mixed client and server.** One `gyral` field can't prove both bundles used one release,
  and never could. The build scripts should assert both resolved the same `@gyral/core`.
- **The host drifting.** A deno_core or V8 upgrade could drop a promised global. gyral-rs adds
  a probe bundle that checks the profile; that side of the contract is gyral-rs's to keep.
- **The stand-in host.** Node's `vm` offers Node's V8 built-ins, not V8 150's. It lacks a few
  newer ones (`Temporal`), so it errs on the strict side; Gyral's Baseline policy keeps the
  server path off them anyway.

## Prior art

Separating a contract version from package versions is how long-lived host interfaces evolve:

- **Node-API.** Versions are integers independent of Node.js releases. An addon built for
  version N runs on every later Node.js that supports N, with no rebuild. Before Node-API,
  addons were tied to each major's ABI and rebuilt every time, which is gyral-rs's situation
  today.
- **LSP.** The specification has its own version, 3.x, independent of every client and server.
  Changes within 3.x are additive, and `initialize` negotiates capabilities.
- **WASI and the component model.** Interfaces carry their own semver (`wasi:http@0.2.0`).
  Runtimes such as Wasmtime release monthly, and a host can serve several interface versions.

The pitfalls: users depend on what was never written down (Hyrum's law; here, the host
globals, so the profile is part of protocol 1); a version nobody is forced to bump drifts (so
the contract test); many live versions multiply testing (WASI's preview1-to-0.2 move needed
adapters); and a protocol number that tracks package versions re-creates the coupling.

## Decisions

The owner's decisions, 2026-10-31, each as the draft recommended:

1. **The field that carries the protocol** is `abi`, unchanged. A new `protocol` field would
   duplicate it and break every existing manifest.
2. **Protocol 1's minimum Gyral release** is 0.3.8, the first with exact core peers (ADR 0033),
   verified by gyral-rs 0.6.0. (Rejected: 0.3.9 only, or 0.3.7.)
3. **The HTML is outside the protocol,** except what the CSP must allow.
4. **Gyral declares it** by exporting `SSR_PROTOCOL` from `@gyral/ssr` in 0.3.10. A helper that
   installs `gyralRender` and writes the manifest can come later.
5. **Testing:** a contract test in `pnpm check` (a `node:vm` run limited to protocol 1's host
   profile, and a fingerprint of the server declarations the protocol relies on); a per-PR
   `rust-compat` job in `ci.yml` against the pinned gyral-rs release binary, with no Rust
   build; the full Rust fixture at release time. No schedule (ADR 0004).
6. **A Gyral minor that keeps the protocol stays compatible:** the protocol is the gate, not
   the version.
7. **No prereleases** are accepted until gyral-5zt decides how Gyral publishes them.
8. **Release order:** gyral-rs 0.8.0 ships before Gyral 0.3.10, so 0.3.10 needs no gyral-rs
   release.

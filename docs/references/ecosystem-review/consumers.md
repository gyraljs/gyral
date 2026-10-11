# Consumer evidence and adoption state

This read-only audit inspected eleven local repositories on October 11, 2026. It
checked manifests, lockfiles and installed core where available, and read current
feedback together with its historical appendices. Workload test totals below are
**consumer-reported evidence**, not gates rerun by this review. Preserved agent traces
and the separate browser diagnostics are analyzed in [agent findings](agents.md).

## Dependency inventory

| Checkout             | Reviewed HEAD | Installed core / declared cohort                        | Snapshot scope                                  |
| -------------------- | ------------- | ------------------------------------------------------- | ----------------------------------------------- |
| gymtime              | `680ae2c8`    | next.9 installed; root/web file tarballs and override   | Clean at snapshot                               |
| gyral-shop           | `62146234`    | next.8 installed, next.9 file manifests                 | Dirty working tree; preserve concurrent changes |
| gyral.dev            | `7fddee0c`    | 0.3.1 installed; seven registry packages, ^0.3.1        | Clean at snapshot                               |
| gyral.dev-blog       | `8d636e02`    | next.5 file packages; historical blog-sabacc branch     | Clean at snapshot                               |
| containment-game     | `ee142dcb`    | next.1 installed/file packages                          | Clean at snapshot                               |
| greed-dice-game      | `cc413c74`    | next.1 file manifests/override; no installed core found | Clean at snapshot                               |
| sabacc-game-site     | `5997eff6`    | 0.3.1 installed; five exact registry packages           | Dirty working tree; preserve concurrent changes |
| starwars.run-site-v2 | `0ca31ae8`    | 0.3.1 installed; three exact registry packages          | Clean at snapshot                               |
| gyral-rs             | `83ab5d2a`    | 0.3.1 installed; exact registry core/SSR                | Clean at snapshot                               |
| gyral-benchmarks     | `72ee36a8`    | historical 0.2/0.3 comparison; not a new 0.3.1 run      | Clean at snapshot                               |
| game-platform        | `49011513`    | 0.3.1 installed; seven exact registry catalog entries   | Dirty working tree; preserve concurrent changes |

“Upgraded to 0.3.1” applies to specific consumers, not the entire local ecosystem.
Gymtime and the shop still need stable registry adoption. A manifest alone cannot
certify an install: the shop's next.9 declaration and next.8 installed core disagree.
The historical blog checkout is not evidence that the live documentation site is stale.
No installs, test runs, source edits or tracker mutations were performed in consumer repos.

## Stable workload evidence

**Joystyk/game-platform:** 67 games, including a recent 22-game batch, exercise grids,
canvas/Three.js, private cards, online sessions, workers, PWA/offline behavior and SSR.
Its latest stable report verifies npm provenance, release-matched skill files and
five conditional/initial/keyed modal regression scenarios. Sixty cancellable dialogs
across 53 files now use native modal binding. Nonmodal result displays and required
choices retain deliberate behavior.

Its reported final gate covers 6,161 unit tests (127 skips), 623 Chromium component tests,
162 production cases in eighteen files, workspace builds and three registry-based Docker
images. The stable report records no new Gyral runtime regression. Production acceptance
is broader than the agent pilot's tiny list/form contracts, but is from one related team.
App bugs encountered in held input, private projections, workers and form parsing were
fixed in the app; they motivate examples, not claims that Gyral lost messages.

**Sabacc:** a shared deterministic game model drives classic and Three.js presentations.
Stable npm installation removes tarballs and overrides, deduplicates core, passes
179 tests in twenty files and reports 43 production cases after targeted reruns with
zero console/page/layout errors. The animated phone capture failure reproduced on
next.9 and was fixed by waiting for fonts/scene readiness before audit and capture.
That is an app harness timing issue, not a stable renderer regression.

Its remaining strongest requests are lifecycle-consistent skill examples, state-owned
playback delays and imperative-widget visual readiness. Native-event and driver-output
inference proposals are lower priority. The reported 87,434 B classic and 244,642 B 3D
gzip JavaScript+CSS totals include the whole application and external libraries; they
must not be advertised as Gyral's runtime size.

**starwars.run:** on-demand SQLite-backed SSR serves a 227,272-article data volume.
Light-DOM search and shadow-DOM Explore islands use automatic component loading.
The team does not exercise router, shared stores, Gyral forms or the HTTP package here.
Its stable migration reports 332 tests in 35 files, a 396-page sample, both-theme
Chromium smoke and code-only Docker checks against the existing data volume. Live Ask
model behavior and old full-archive timings were not repeated.

The key tooling issue is a reported 3.26 percentage-point branch-coverage difference
when template locations are enabled, with the same 332 tests passing. Current source
still emits the cited fallback expression. This audit verified the source, not the
consumer's whole controlled coverage experiment. Style-hash build metadata, static-head
markers, Node view tests and one-file production bundling are separate remaining asks.

**gyral-rs:** exact registry core/SSR 0.3.1 feed embedded V8 SSR and Askama/client examples.
Its current report records the Rust, browser, snapshot-isolation, operating and container
checks summarized in [Rust ecosystem](rust.md). Its local stable verification and fixture
snapshot experiment do not establish hosted CI, public crate availability or complete
Gymtime compatibility. The working tree was dirty initially and became a new clean
commit during this review; the final captured revision is used below.

**gyral.dev:** stable registry dependencies and public docs provide the release-matched
agent entry points. Publication of this review does not refresh Context7; the owner's
separate-key hold remains in effect.

## Workloads still on internal packages

**Gymtime:** thirteen Gyral components replace the earlier Lit frontend while Rust/SQLite
retain invitations, email-code auth, organizer/coach/parent roles, schedules, recurrence,
conflicts, bulk approvals, cancellations/swaps, notifications and calendar exports.
Its rewrite decomposed a 2,607-line planner. A shared Effect runtime behind drivers owns
external services; signals, concurrency lanes, revision guards and idempotency keys
handle overlapping reads/writes. Public landing SSR runs at build time.

Its October 10 verification reports seventeen TypeScript model/service tests, 43 Rust tests,
twenty browser component tests and sixteen full-stack Chromium/WebKit cases, plus build
and Docker startup. These are next.9 results, not stable 0.3.1 verification or claims about
live email delivery/deployment. Twenty-seven documented acceptance scenarios make it
an especially useful source for booking/form/auth examples and upgrade regressions.

**gyral-shop:** commerce, account/admin, no-JS forms, strict CSP and SSR/hydration offer
substantial acceptance coverage. Its historical loader, folded-module, secret-field,
error-feature and Node-address complaints drove shipped Gyral fixes. The
[isolated loader measurement](../component-loading-size-2026-10-11.md) explains the
resolved size investigation. Its current source/docs/install drift means neither
older next.8 performance nor next.9 adoption text certifies a stable build today.

**Containment and Greed:** old next.1 file dependencies remain. Containment's private
`@local-games/runtime` separates a framework-neutral core from a `/gyral` watch/action
bridge, with namespaced drivers, observation/select and disposal. It is not a published
Gyral extension. Preserve that separation when discussing a shared game-session package;
coordinate actual upgrades and their regressions in the consumer trackers.

**Benchmark checkout:** its README/methodology describe historical framework app and
renderer measurements; no fresh stable 0.3.1 comparison was executed here. Framework
implementation sources were not inspected. Those measurements answer different questions
from agent completion and must retain their original versions and controls.

## Source register

The links below point to repository documents at the captured revision. GitHub access may
require the owner's permissions. Sabacc feedback differs in a dirty working tree, so its
link is a location anchor, not proof the revision contains the exact reviewed text.
File hashes below identify the actual local evidence. Joystyk became dirty during the
review, but the recorded feedback/quality hashes did not change. Local paths use the
owner's checkout layout; another reviewer should use the repository links.

| Source                | Documents used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| game-platform         | [docs/references/gyral-feedback.md](https://github.com/the-zoop-troop/game-platform/blob/4901151379fe4cbdd8b47797c85e738ff5a232e6/docs/references/gyral-feedback.md), [docs/QUALITY_SCORE.md](https://github.com/the-zoop-troop/game-platform/blob/4901151379fe4cbdd8b47797c85e738ff5a232e6/docs/QUALITY_SCORE.md)                                                                                                                                                                                                                                                                                                                                                           |
| sabacc-game-site      | [docs/references/gyral-feedback.md](https://github.com/mikezupper/sabacc/blob/5997eff672bc439a4d44b1f062ef7c6e517025ff/docs/references/gyral-feedback.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| starwars.run-site-v2  | [docs/gyral-feedback.md](https://github.com/mikezupper/star-wars-run-v2/blob/0ca31ae800c4040b37e3a0cbcdd6adde5bbc9155/docs/gyral-feedback.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| gymtime               | [docs/frontend.md](https://github.com/mikezupper/gymtime/blob/680ae2c8f58396b5bbaa5b2d6b465dff11c90c0e/docs/frontend.md), [docs/gyral-rewrite.md](https://github.com/mikezupper/gymtime/blob/680ae2c8f58396b5bbaa5b2d6b465dff11c90c0e/docs/gyral-rewrite.md), [docs/verification.md](https://github.com/mikezupper/gymtime/blob/680ae2c8f58396b5bbaa5b2d6b465dff11c90c0e/docs/verification.md)                                                                                                                                                                                                                                                                               |
| gyral-rs              | [README.md](https://github.com/gyraljs/gyral-rs/blob/83ab5d2a00b4727ad5120c39bef6e71b2c45cb97/README.md), [ARCHITECTURE.md](https://github.com/gyraljs/gyral-rs/blob/83ab5d2a00b4727ad5120c39bef6e71b2c45cb97/ARCHITECTURE.md), [docs/verification.md](https://github.com/gyraljs/gyral-rs/blob/83ab5d2a00b4727ad5120c39bef6e71b2c45cb97/docs/verification.md), [docs/design/bundle-contract.md](https://github.com/gyraljs/gyral-rs/blob/83ab5d2a00b4727ad5120c39bef6e71b2c45cb97/docs/design/bundle-contract.md), [docs/design/runtime-evaluation.md](https://github.com/gyraljs/gyral-rs/blob/83ab5d2a00b4727ad5120c39bef6e71b2c45cb97/docs/design/runtime-evaluation.md) |
| gyral-rs native forms | [Askama contract](https://github.com/gyraljs/gyral-rs/blob/83ab5d2a00b4727ad5120c39bef6e71b2c45cb97/docs/design/askama-client.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| gyral-shop            | [Stack history](https://github.com/gyraljs/gyral-shop/blob/62146234d2c45e096ddab7c8bc808379504ba48c/docs/design-docs/0001-stack.md), [quality](https://github.com/gyraljs/gyral-shop/blob/62146234d2c45e096ddab7c8bc808379504ba48c/docs/product-specs/quality.md)                                                                                                                                                                                                                                                                                                                                                                                                            |
| Containment           | [Runtime package](https://github.com/mikezupper/containment/blob/ee142dcb477f10baf7f27e6af90fed0c7b16d99e/packages/game-runtime/README.md), [quality report](https://github.com/mikezupper/containment/blob/ee142dcb477f10baf7f27e6af90fed0c7b16d99e/docs/quality/2026-10-08-mobile-and-runtime.md)                                                                                                                                                                                                                                                                                                                                                                          |
| Benchmarks            | [README](https://github.com/gyraljs/benchmarks/blob/72ee36a88c72f3557d4bc9ecb69c63ed6d0c8e41/README.md), [methodology](https://github.com/gyraljs/benchmarks/blob/72ee36a88c72f3557d4bc9ecb69c63ed6d0c8e41/docs/methodology.md)                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### SHA-256 of reviewed evidence

| Consumer / file                                      | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| game-platform / docs/references/gyral-feedback.md    | `9f7dca9094764c96ae1e84480db96f591253e58f34f6cccf53ed325f27b28032` |
| game-platform / docs/QUALITY_SCORE.md                | `677e5baa0b74da5852aca8c7e1623da555e712f7567f5a6b1133f446dafb26b7` |
| sabacc-game-site / docs/references/gyral-feedback.md | `3444330d6b323ff75c41329a2f0e6328b686304d6bad93a4c979d5d7a163063e` |
| starwars.run-site-v2 / docs/gyral-feedback.md        | `10297332ec0fe84413544ec75652d6bb49a1bf8ed1e537acf21ae223bcc2e19f` |
| gymtime / docs/frontend.md                           | `170799bd69c5d44d73bd2f07a9a02010bb3251474d8a5d6902082af187771d7b` |
| gymtime / docs/gyral-rewrite.md                      | `84298457b29b9cec84a2d84182629b93bc641a7fae131288e8abf3c9d91af664` |
| gymtime / docs/verification.md                       | `0ac875cfdf3dbb5625d81060b4479441a0d785969a7da49758897980ba4656cb` |
| gyral-rs / README.md                                 | `86b7e6b6b9afce6bbc504f4a2a182c246414368c7249040d2e97cd117c080648` |
| gyral-rs / ARCHITECTURE.md                           | `121ae9b41b21052687a45c5022586de764a679ddf8e09993b2fb0f14af1847fa` |
| gyral-rs / docs/verification.md                      | `b167b5a7ead4e143de61f01640d9f4b4e64ec5bc7c24f454e5cab7d9fb7ac02f` |
| gyral-rs / docs/design/bundle-contract.md            | `0303ccec73803d0f4a5a37ca661dbe4ad41c42353b4d4210974eeac53d89416b` |
| gyral-rs / docs/design/runtime-evaluation.md         | `4e0d4b5b269deb91f6c268ffea6de2f02a22c2a8ed6df522c34d1ca78d9d50e0` |

The local discovery covered Gyral dependency manifests and feedback in the known Git
checkouts, excluding framework source clones, duplicate agent worktrees and generated
outputs. An unrelated PostgreSQL data directory was unreadable; this is not a claim of
exhaustively reading every file under the owner's home directory. Consumers share authors
and practices, so successful reports are not statistically independent ecosystem adoption.

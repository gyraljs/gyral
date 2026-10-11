# Consolidated feedback from 0.3.1 workloads

This catalog describes findings and maps them to Beads, the implementation tracker.
It groups repeated requests rather than creating one issue per sentence. Sources and
reported validation are in [consumer evidence](consumers.md); resolved requests are
in [shipped improvements](shipped.md). “Reported” does not mean independently reproduced.

`gyral-49t` owns the sixteen consumer-feedback children below. Agent calibration remains
in the existing `gyral-7se.13`; the newly discovered cache restriction is `gyral-7se.14`.
Each Bead contains its own acceptance criteria and a `discovered-from:gyral-c0z` link.

## Agent execution and measurement

| Bead           | Evidence and finding                                                                                                                    | Priority / kind              | Validation required                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gyral-7se.13` | Sixteen untouched apps at request limit; unbalanced available corpora; hidden remaining budget; MCP workflow instructions omitted       | P2, harness/docs calibration | Visible budget, bounded exploration, task-matched retrieval and complete MCP onboarding; track first edit/check and repeated reads in separate diagnostics; agree scope before a new frozen study |
| `gyral-7se.14` | Exported form typechecks but generated element map cannot write into read-only `/app`; isolated cache permits identical source to build | P1, harness bug              | Protect source/oracle/dependencies while allowing bounded generated outputs; smoke-test exported multi-file components; distinguish infrastructure errors from app failures                       |

The [agent analysis](agents.md) explains what the original traces prove, what the new
diagnostics add, and why neither result supports a universal framework ranking.

## Guidance and adoption

**`gyral-49t.1` — P1, stale skill lifecycle guidance.** Sabacc's current feedback is
confirmed in Gyral source: three continuous watches start from `init`; an unbound
driver throws; the command guide's opening recommends listening to the router in
`init` despite correct later subscription advice. Align examples with declarative
subscriptions and typed tokens. Verify true detach, completed teardown, external change
and reattach; a same-task DOM move is a separate test. Refresh released/site/MCP snapshots
through normal versioned release work, rather than silently altering the measured corpus.

**`gyral-49t.2` — P1, coverage instrumentation.** starwars.run reports 80.31% branch
coverage without the locator versus 77.05% with it, with all 332 tests passing in both
runs. The current optional-access/fallback transform exists in source. Reproduce this
in a controlled fixture, then preserve useful diagnostics without charging generated
branches to consumer coverage. Do not lower the application's coverage threshold.

**`gyral-49t.3` — P1, remaining registry upgrades.** Gymtime, shop, Containment and Greed
still declare internal tarballs. Gymtime installed next.9; shop declares next.9 but
installed next.8. Coordinate changes in each consumer's tracker, preserve dirty work and
prove frozen registry install, one core, refreshed skill and relevant browser/production
contracts. Gymtime's booking races, native form errors, auth and idempotency are essential
checks. The historical blog checkout is not an active release gate.

**`gyral-49t.4` — P2, migration tooling and semantic changes.** Joystyk, Sabacc and
starwars.run request import-aware two-call `define`/intent migrations and clearer root
errors, rather than a cascade after the old signature. Codemods must preserve aliased
imports, generics, native `customElements.define` and row helper typing. Clock migration
must cover tick counts versus epoch milliseconds, immediate emission and pause/resume:
numeric types alone cannot prove the new behavior. Dry-run edits and deterministic model
tests are appropriate; publishing future prereleases is a separate policy question.

## Real application lifetimes and state

**`gyral-49t.5` — P2, lifecycle boundaries and pending delays.** Sabacc playback needs a
subscription lane containing run and step, with both guarded on replies. Test adjacent
equal-duration steps, duplicates, unrelated updates, true detach/full-delay resume and
same-task moves retaining elapsed time. Joystyk also needs stable provider/input examples,
missing-provider/failure behavior and precise `prop.json` versus `prop.value` equality.
Focus delegation, one-root/one-second waiting, cancellation and choosing a successor
should be explained beside the fix. `settled()` is not a network or global focus barrier.
This is guidance for working APIs, not a request to replay all initialization commands.

**`gyral-49t.6` — P2, owned worker commands.** Joystyk's generators and computer jobs
need pure computation off the main thread. Show a command/worker bridge with replacement,
abort-before-reply, malformed replies, rejected work, late results and component removal.
Gyral owns command lifetime; the app owns worker termination and transferred resources.
Verify cleanup on success/error/cancellation rather than presenting only a Promise.

**`gyral-49t.7` — P2, authoritative snapshots with local drafts.** Joystyk's concurrent
selections and Gymtime booking drafts need stable-ID reconciliation, not clearing every
edit on every revision. Show stale-read protection, public/private/spectator projections,
viewer changes, shared service ownership and failed reload after successful writes.
Reuse idempotency keys where appropriate. Backend authorization, transaction semantics
and role policy remain outside Gyral; hiding DOM does not protect supplied data and an
aborted command does not reverse an already committed write.

**`gyral-49t.8` — P2, substantial native interaction.** Joystyk requests held directions,
press/release modifiers, key fallback, pointer capture, release outside a button,
cancellation/blur/hide, touch traces, shadow focus, SVG and canvas/graphics cleanup.
starwars.run adds document popovers surrounding shadow components: retargeted events
and accessible description references cross different scopes. Verify keyboard/text
alternatives, target sizes, reduced motion and feature-detected native references.
Document fonts and observers need explicit shared/document ownership. This does not
resume the held virtualization investigation or move graphics engines into core.

## Testing and production integration

**`gyral-49t.9` — P2, test ergonomics and visual readiness.** starwars.run still casts
direct Node view context and strips development markers; public `parse()` and browser
`mount()` meet different needs. Evaluate view/keyboard/hydration helpers against those
fixtures before expanding exports. Sabacc needs font/camera/scene readiness before both
audit and capture; Joystyk needs real-worker load conditions and generous correctness
deadlines rather than hardware-speed assertions. Tests should assert multi-control form
values from `target.name`, checked/numeric/schema parsing and native invalid submission,
not merely the presence of controls. Keep third-party renderer readiness explicit.

**`gyral-49t.10` — P2, CSP and build style metadata.** starwars.run wants inline shadow
style hashes in a build manifest, without importing server components just to assemble
a shared Caddy policy. Joystyk needs a complete strict-CSP first-paint example, including
buffering, the 128-distinct-style-attribute-hash cap and header size. Explain CSSOM after
hydration versus server first paint and finite class/stylesheet alternatives. Hashed
document CSS migration must preserve native nesting/theme semantics; development needs
a Vite nonce/HMR origin strategy. Verify both themes, a local dark subtree, hydration
and browser errors under the actual policy. SvelteKit/Astro also support hash CSP;
do not turn this into an unsupported exclusivity claim.

**`gyral-49t.11` — P2, Node production bundling and server composition.** starwars.run
externalizes Vite in a one-file API bundle because the shared Node entry exposes the
development helper; it serializes `ComponentAssets.modules` as Map entries before
deleting `.vite/`. Document and verify no runtime Vite import or omitted emitted assets,
metadata survival and separate code/data deployment. Joystyk additionally retains
HTTP/WS proxy, trusted-peer/origin, metrics, logging, request context and shutdown policy.
The dev server is not a replacement for every custom platform server. Consider a
production-only entry only after reproducing a material packaging benefit.

**`gyral-49t.12` — P2, PWA preloads and lazy asset ownership.** Joystyk's merged dynamic
workspace chunks may lack simple manifest `src`/`isDynamicEntry` markers while feature
assets still need offline ownership. Cover first navigation, controlled reload, offline
pages, old-release retention and replacement. Its local workaround strips worker-controlled
HTML's modulepreloads before parsing and disables runtime JS hints while retaining CSS
and the necessary initial network graph. Removal after hydration is too late. Reproduce
the exact Chromium warning before claiming a browser version fixes it.

## Lower-priority API and distribution discussions

**`gyral-49t.13` — P3, type ergonomics and discoverability.** Sabacc's plain custom-event
`detail` remains `unknown`; use guarded adapters before considering an export. Compare
per-input driver result inference with splitting operations into separate drivers.
`IntentNames`, `intentsOf`, `commandsFor` and `inputsFor` already exist; make them easy to
find. A type-only `IntentsOf<typeof Component>` and cyclic view helper inference need
representative compile fixtures, not speculative API growth.

**`gyral-49t.14` — P3, static managed-head markers.** starwars.run never calls `setHead`
and uses `extraHead` for static metadata. Measure marker cost before choosing an opt-out
or documenting that existing path. Preserve managed client reconciliation. Arbitrary
meta attributes and early theme scripts are already shipped and should stay closed.

**`gyral-49t.15` — P2, Rust compatibility.** Document Gymtime's API/build-time path,
Askama/native-form widgets and embedded SSR separately. Exact npm/ABI/build integrity,
hydration/CSP and target limits need cross-release fixtures. Rust crates are unpublished;
split browser bundles and full-app snapshot compatibility are not established. Coordinate
the latter with `gyral-rs-xun.5`, rather than duplicating its implementation in Gyral.

**`gyral-49t.16` — P3, owner distribution decision.** Future npm `next` tags and peer-core
dependencies could reduce trial cost, but stable 0.3.1 already deduplicates correctly in
upgraded apps. They are policy proposals, not an unresolved stable-install failure.
The owner's previous restriction on prerelease publication requires a new decision;
this review publishes no package and submits nothing to Context7.

## Existing work and closure disposition

Historical feedback has already been addressed by `gyral-c5d`, `gyral-dyn`, the
`gyral-1zd` implementation children and the conditional modal/focus fixes. Keep those
closed; their historical consumer appendices do not create new open defects. The
[shipped disposition](shipped.md) covers Joystyk's original 31 items and the corrected
Sabacc/starwars.run complaints, including inspection APIs that already existed.

No unfinished implementation Bead becomes complete simply because this audit describes
it. `gyral-c0z` can close when the report and validation are delivered; `gyral-49t` and
the two calibration/cache tasks remain implementation work. `gyral-1zd.11` stays held
for virtualization, and `gyral-7se.5` stays held for the owner's Context7 key. Existing
Baseline fallback-removal Beads keep their recorded dates and are not consumer regressions.

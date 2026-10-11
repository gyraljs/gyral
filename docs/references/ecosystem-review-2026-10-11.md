# Gyral 0.3.1 ecosystem and agent review

Reviewed on October 11, 2026, against Gyral `cf042c9`, released npm 0.3.1 and the
local consumer sources recorded in [consumer evidence](ecosystem-review/consumers.md).
The review is tracked by `gyral-c0z`; implementation findings belong to Beads.

Gyral has removed substantial integration code from real applications. The stable
consumers report successful production, browser and model checks, including the
conditional-dialog regression. Its largest immediate weaknesses are inconsistent
agent guidance, incomplete production recipes, coverage instrumentation and consumer
upgrade drift. The agent pilot also exposed problems in our experimental harness.
It does not establish that the framework cannot support those workloads.

## Read the evidence

| Review                                                 | What it establishes                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [Consumers](ecosystem-review/consumers.md)             | Actual dependency state, workload coverage, reported checks and source provenance, including Gymtime         |
| [Shipped improvements](ecosystem-review/shipped.md)    | What changed, which workarounds disappeared and which older complaints are resolved                          |
| [Agent failure analysis](ecosystem-review/agents.md)   | All eighteen Gyral traces, documentation imbalance, omitted MCP instructions and separate diagnostic results |
| [Framework comparison](ecosystem-review/frameworks.md) | Gyral versus React, Preact, Svelte, Astro, Vue and Solid, using official documentation                       |
| [Rust ecosystem](ecosystem-review/rust.md)             | How Gymtime, embedded Gyral SSR and Askama/client widgets fit together                                       |
| [Feedback catalog](ecosystem-review/feedback.md)       | Every remaining feedback theme, priority, evidence and its deduplicated Bead                                 |

## Why the agent failed

The premise needs one correction: Gyral passed **2 of 18** measured trials. Ordinary
docs passed 0/9; skill plus MCP passed 2/9. React passed 8/9 and Svelte 9/9 in this
particular Qwen3.8-27B pilot. Preact, Vue, Solid and Astro were not measured.

All sixteen failed Gyral trials exhausted the 24-request allowance with **zero source
edits and zero agent checks**. They failed against unchanged starter applications,
rather than implementations that had encountered a Gyral type or runtime defect.
The immediate observed failure was endless documentation/API exploration. Familiarity
with React/Svelte is a plausible contributor, but these traces cannot prove it.

Our harness made onboarding uneven: Gyral received one 654 KB comprehensive document;
React received five focused files totaling 189 KB and Svelte five totaling 42 KB.
The agent could not see its remaining request budget. The MCP bridge exposed tools
but omitted the server's workflow instructions and component-building prompt. None of
the assisted trials used the example, scaffold or snippet-checking tools. These are
material limitations in a study we built, not excuses to discard its outcomes.

Separate continuation diagnostics found that four extra requests alone still produced
only documentation reads. An implement-now prompt produced a form, but it exposed a
read-only build-cache restriction in our sandbox. After allowing an isolated cache,
the identical source typechecked and built, then failed three of four browser cases.
The prompt elicited code but did not yield a fully correct result. The agent never saw
those later browser failures, so its ability to repair them remains unmeasured.
Two other prompted continuations had
provider errors and are inconclusive. None changes the original 36-run dataset.

## What the applications say

The upgraded game platform, Sabacc and starwars.run report no new Gyral runtime
regression from adopting stable npm 0.3.1. That is encouraging evidence across very
different workloads, with explicit limits: their full gates were reported by the
consumer teams, not rerun during this read-only audit. Source inspection verifies
their package state and the remaining requests; it is not an independent production
certification.

Gymtime is a useful counterexample to the assumption that every consumer upgraded:
its manifests, lockfile and installed packages still use next.9 tarballs. The shop
also has manifest/install drift. Their older verification cannot certify stable 0.3.1.
The first consumer action is to upgrade from the registry and run workload-specific
checks, without overwriting concurrent work in their repositories.

## Priorities supported by the evidence

1. **Repair agent execution and measurement.** `gyral-7se.13` covers visible budget,
   bounded exploration, focused retrieval and complete MCP onboarding;
   `gyral-7se.14` covers isolated generated build caches. A new frozen comparison
   needs agreed scope; diagnostic continuations are not replacement trials.
2. **Correct guidance that still teaches obsolete lifetimes.** `gyral-49t.1` updates
   the skill's continuous watches in `init` and throwing driver defaults, with true
   detach/reattach tests. Typechecking snippets alone misses these lifecycle errors.
3. **Fix developer-tool friction.** `gyral-49t.2` reproduces coverage distortion;
   `gyral-49t.4` covers import-aware migration and semantic clock changes.
4. **Finish consumer adoption.** `gyral-49t.3` coordinates registry upgrades,
   particularly Gymtime, and keeps package/skill provenance aligned.
5. **Teach substantial workloads.** The remaining `gyral-49t` children cover
   state-owned delays, worker cancellation, drafts against authoritative snapshots,
   native interaction, visual readiness, CSP, production bundles, PWA asset ownership
   and Rust compatibility. Most are examples or integration guidance for working APIs.

Lower-priority API proposals remain discussions: typed native-event adapters, per-input
driver results, a type-only intent-name helper, static head markers and future
prerelease publishing. The catalog separates these from reproduced defects and
already-shipped capabilities. No broad runtime redesign is justified by this review.

The owner holds on virtualization (`gyral-1zd.11`) and Context7 submission
(`gyral-7se.5`) remain in effect. Stable npm publication resolved the release prerequisite;
it did not revoke the later hold for a separate Context7 key.

## Verification and limits

This review inspected local manifests, lockfiles, installed packages, source and dated
feedback; analyzed every measured Gyral transcript; and executed separately retained
continuation/browser diagnostics. It changed no consumer source or dependency state.
Some consumer worktrees changed independently during the audit; provenance is a dated
snapshot, with hashes for the feedback text actually used.

The full report distinguishes consumer-reported tests, directly inspected code,
executed diagnostics and hypotheses. It makes no new renderer speed, framework-size,
live deployment, billing-cost or model-generalization claim. Comparisons concern
documented architecture and the measured pilot, not a universal framework ranking.

Report validation: `pnpm check` exited zero, with 1,929 tests passing and one skipped
across 295 files, twenty bundles within size budgets, unchanged fixtures and all nine
package checks passing. All 3,284 original evidence files matched their manifest;
the measured archive checksum was unchanged. Diagnostic and report credential scans passed.

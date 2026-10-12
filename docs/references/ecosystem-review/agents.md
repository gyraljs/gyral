# Why the Gyral agent trials failed

The measured pilot used Qwen3.8-27B, released npm Gyral 0.3.1, three tasks and three
trials per condition. The [original protocol/results](../agent-benchmark-pilot.md)
remain the record of the frozen 36-run experiment. This review inspected all eighteen
Gyral transcripts and their independent final grades. New continuation diagnostics
are explicitly separate, use additional requests and do not revise measured outcomes.

## Actual scores and observed stopping behavior

| Condition            | Feature | Seeded bug | Form | Total |
| -------------------- | ------: | ---------: | ---: | ----: |
| Gyral ordinary docs  |     0/3 |        0/3 |  0/3 |   0/9 |
| Gyral skill + MCP    |     0/3 |        2/3 |  0/3 |   2/9 |
| React ordinary docs  |     3/3 |        2/3 |  3/3 |   8/9 |
| Svelte ordinary docs |     3/3 |        3/3 |  3/3 |   9/9 |

Gyral did not fail every trial. All sixteen Gyral failures reached **24 model requests**
with **no source write and no agent check**. Their unchanged scaffolds typechecked and
built; feature/form apps lacked the requested UI and bug apps retained the seeded
identity error. The harness independently graded every final app. No measured Gyral
failure was caused by an attempted implementation failing typecheck, a provider outage,
missing token usage or the 131,072-token context ceiling.

| Run ID                     | Result / stop        | Requests | First source write | First agent check |
| -------------------------- | -------------------- | -------: | -----------------: | ----------------: |
| `gyral-assisted-bug-1`     | Fail / request limit |       24 |                  — |                 — |
| `gyral-assisted-bug-2`     | Pass / finished      |       12 |                 10 |                11 |
| `gyral-assisted-bug-3`     | Pass / finished      |       17 |                 15 |                16 |
| `gyral-assisted-feature-1` | Fail / request limit |       24 |                  — |                 — |
| `gyral-assisted-feature-2` | Fail / request limit |       24 |                  — |                 — |
| `gyral-assisted-feature-3` | Fail / request limit |       24 |                  — |                 — |
| `gyral-assisted-form-1`    | Fail / request limit |       24 |                  — |                 — |
| `gyral-assisted-form-2`    | Fail / request limit |       24 |                  — |                 — |
| `gyral-assisted-form-3`    | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-bug-1`         | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-bug-2`         | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-bug-3`         | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-feature-1`     | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-feature-2`     | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-feature-3`     | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-form-1`        | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-form-2`        | Fail / request limit |       24 |                  — |                 — |
| `gyral-docs-form-3`        | Fail / request limit |       24 |                  — |                 — |

The two assisted bug successes edited by requests 10 and 15, checked on 11 and 16,
and ended on 12 and 17. Their repair addressed identity rather than filtered position.
All nine React and all nine Svelte trials edited and checked. React's one failed bug
trial introduced a JSX syntax error while repairing identity, and exhausted its budget
with failed type/build checks. That is a different failure mode from untouched Gyral apps.

## Documentation and tool use

| Condition, nine trials each | Guide reads | MCP API calls | Source writes | Agent checks |
| --------------------------- | ----------: | ------------: | ------------: | -----------: |
| Gyral ordinary docs         |         190 |             0 |             0 |            0 |
| Gyral skill + MCP           |          61 |           122 |             2 |            2 |
| React                       |          32 |             0 |            16 |           15 |
| Svelte                      |          24 |             0 |            12 |           11 |

Assisted Gyral additionally made three MCP searches and five MCP document fetches.
Across all nine assisted runs it never called `get_example`, `scaffold_component` or
`check_snippet`, although those tools were exposed. It inspected APIs repeatedly
rather than creating a minimal implementation and using feedback to repair it.

`gyral-docs-feature-1` made 22 guide reads. It moved from model/intent/view/forms to
styling, testing, effects, errors, SSR, stores, devtools, deployment and code-splitting
without writing source. Reads usually requested 12,000-character excerpts; the available
corpus was not injected in full. `gyral-assisted-feature-1` read eight skill excerpts
and made eighteen API calls without editing. Successful assisted bug trial 2 instead
used three targeted guide excerpts, one API lookup, one write and one check.

Seven nonfatal MCP errors occurred across five runs: four missing `Reducer` export
lookups, one `ParseResult`, one `StandardSchemaV1`, and a `get_doc` argument named `path`
rather than `path_or_url`. They did not constitute a transport outage, and cannot explain
all sixteen failures. Better exact export discovery and representative code could avoid
them without exporting nonexistent or internal types just to satisfy an agent guess.

## Confounds in our harness

| Available documentation                | Files | Characters | UTF-8 bytes |
| -------------------------------------- | ----: | ---------: | ----------: |
| Gyral ordinary consumer corpus         |     1 |    653,914 |     654,415 |
| React selected official guides         |     5 |    188,605 |     188,717 |
| Svelte selected official guides        |     5 |     41,731 |      41,776 |
| Additional Gyral skill/reference files |    16 |    221,272 |     221,562 |

Equal access to a `read_doc` tool and the same behavioral oracle did **not** normalize
onboarding. Gyral's comprehensive corpus accompanied broad exploration; React and
Svelte had focused files. The traces do not isolate document breadth from model policy.
We did not measure equal topic coverage or retrieval cost.
The same generic loop hid the remaining 24-request budget, with no progress checkpoint,
repeat-read warning, ranked retrieval or context compaction.

In `scripts/agent-pilot/mcp.mjs`, the bridge connects the SDK client and forwards
`listTools()` definitions. It does not forward server instructions or expose the
`build-gyral-component` prompt. The actual server instructs agents to read the skill,
use examples/scaffolding and check snippets. The assisted prompt contained the skill
and tools, but missed this workflow guidance. This is a limitation of our bridge,
not evidence that MCP itself cannot guide implementations.

All 36 measured runs had actual usage: **12,539,436 tokens across 578 requests**.
The largest measured request reported 83,311 prompt tokens, below the model context
limit. Large cumulative token totals include repeated transmission of growing history;
they do not imply a single request exceeded context. Unlimited monetary authorization
was separate from fixed request/tool/time limits. Verified dollar cost is unavailable.
The original two invalidated harness attempts remain outside the 36-run scores.

Model familiarity, explicit MVI/type overhead and documentation breadth are plausible
contributors. Only exploration, missing edits and the harness differences are directly
observed. The experiment did not isolate those causes or demonstrate that replacing
Gyral's architecture would improve correctness.

## Separate continuation diagnostics

Each continuation resumes the saved first ordinary-docs trial for that task after
request 24. It retains source, prior transcript and oracle, then permits four extra
requests with the same model/settings. These are dependent continuations, not fresh
independent trials. The prompted variant adds: four requests remain, stop exploring,
implement now with `write_file`, then call `check`.

| Diagnostic                                 | Observed result                                                           | Interpretation                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Feature, no prompt change                  | Four more `read_doc` calls, no edit/check, final fail                     | More requests alone did not break this exploration loop                                       |
| Feature, implement prompt                  | Dispatched request raised `TypeError: fetch failed`; no response          | Provider/transport failure; no model-behavior conclusion                                      |
| Bug, implement prompt                      | HTTP 499, `Client Closed Request`, no usage                               | Provider failure; no model-behavior conclusion                                                |
| Form, implement prompt                     | Two writes, one check, one source read; types pass; build cache denied    | Guidance elicited implementation; the sandbox blocked a valid build prerequisite              |
| Same form, separate writable-cache regrade | Identical source types/build pass; 1/4 browser cases pass; no page errors | Prompting does not establish a correct solution; native validation/error behavior still fails |

The form exports `Signup`, which triggers generated element typings. The original
sandbox mounts `/app` read-only; creating `/app/.gyral` failed before browser execution.
Empty/non-exported seeds and the measured bug repairs did not exercise this. Thus the
cache defect is **latent in the original harness**, not the observed cause of the
sixteen no-edit outcomes. Its primitive grader recorded build exit 1 as an app failure;
this review identifies the cache prerequisite as infrastructure.

An initial corrective cache mount also failed because its mountpoint did not exist
inside the read-only app. That failed Docker-125 attempt is retained. A new app copy
with a precreated empty mountpoint and a separate writable cache succeeded. No source,
dependency, oracle or prior measured artifact was changed. The resulting form fails
multiple-error/focus, native-email/error-preservation and correction/mouse cases, while
passing the trimmed-name/Enter case. Its native `required` email can stop submission
before its custom update supplies the requested errors. No page error appeared.

The agent never received these later browser failures: its check stopped at the cache
error before the continuation ended. This diagnostic cannot establish its repair ability
or predict a completion rate under a corrected harness.

Ten additional model requests were dispatched; eight returned complete usage totaling
**646,069 known tokens**. The two provider failures have unknown billed usage. An added
accounting annotation corrects the fetch-failed raw summary's misleading zero: an
unanswered dispatched request is not known to cost zero. No retry silently replaces
those failures. Cache-only regrades made no additional model requests.

## Evidence and what to change

Measured archive:
`~/.local/share/gyral-agent-pilot/runs/2026-10-11-qwen38-v2.tar.gz`

SHA-256:
`593d94052fc88d80cbfd103bc7c70fd7a161d7fab6562d0654a6cc0a09158a59`

The extracted directory has `report.html`, summaries and all per-run requests, responses,
transcripts, patches, grades and screenshots. Diagnostic evidence is in
`~/.local/share/gyral-agent-pilot/review-diagnostics-2026-10-11/`: `protocol.json`,
`runner.mjs`, each variant's records, `accounting-annotations.json`, and separately
retained cache regrades. The protected final form screenshots and logs show the actual
remaining failures. Credentials remain outside these artifacts.

`gyral-7se.13` should calibrate visible budgets, bounded task-relevant exploration,
complete MCP instructions/examples and fair focused corpora. `gyral-7se.14` should
validate exported/multi-file components with isolated generated outputs. Track first
write/check, repeated reads, useful-tool use and correctness together; improving one
counter alone is insufficient. Correct stale skill lifetimes in `gyral-49t.1`.

[Protocol v3](../agent-benchmark-pilot-v3.md) implements these harness fixes (H1–H7) for
new runs. A new measured study needs agreed scope and a newly frozen protocol. Do not retroactively
rescore the original pilot, replace outages with successes or pool prompted continuations
with independent trials. Include additional frameworks only with equivalent validated
contracts; Astro needs an explicit island renderer. The [comparison](frameworks.md)
separates architectural tradeoffs from unmeasured rankings.

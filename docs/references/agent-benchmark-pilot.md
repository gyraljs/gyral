# Agent benchmark pilot protocol

Track this work in `gyral-7se.10`. The owner approved three tasks, four conditions and
three independent trials per task/condition: **36 measured runs**. This protocol defines
the pilot's behavioral contracts and measurements. Scaffolds, the browser oracle and a
provider-specific runner are in `scripts/agent-pilot/`; `scripts/agent-pilot.mjs` is the
entry point. The protected oracle and local validation must pass before measured runs.

The subsequent [ecosystem and trace review](ecosystem-review-2026-10-11.md) documents
corpus imbalance, omitted MCP workflow instructions and a latent generated-cache sandbox
restriction. It includes separately retained continuation diagnostics; the original
36-run results and frozen artifacts below remain unchanged.

## Conditions and versions

| Condition        | Framework              | Additional assistance                                |
| ---------------- | ---------------------- | ---------------------------------------------------- |
| `gyral-docs`     | `@gyral/core` 0.3.1    | Ordinary consumer docs                               |
| `gyral-assisted` | `@gyral/core` 0.3.1    | The same docs, released skill and `@gyral/mcp` 0.3.1 |
| `react-docs`     | React/React DOM 19.3.0 | Ordinary official docs                               |
| `svelte-docs`    | Svelte 5.57.2          | Ordinary official docs                               |

Versions were checked against the npm registry on 2026-10-11. Install exact versions
from npm in independent projects, without the renderer benchmark repository's overrides
or vendor packages. Preserve the generated lockfiles in the frozen corpus and results
bundle, with their checksums in the execution manifest.

Use one fixed agent/model/settings for every condition: this repository's tool-loop agent,
Blueclaw's `Qwen3.8-27B` through `https://openai.blueclaw.network/v1`, temperature 0.2,
non-streaming Chat Completions. The owner corrected the original Qwen3.6 model selection;
the corrected model passed tool-call and tool-result continuation probes. The provider's
alias does not establish immutable model weights; retain its raw model/fingerprint fields.
The owner explicitly authorized **unlimited monetary spend**, superseding the original
hard-cost-cap requirement. No verified Blueclaw dollar price is available; retain actual
usage and report cost as unavailable. The assisted condition
adds access to the released skill and MCP; neither changes the Gyral version or scaffold.

## Task contracts

Supply the same behavioral prompt for a task to all four conditions, with only the
framework name substituted. Keep task requirements available to the agent; keep the
authoritative executable oracle outside its writable workspace.

**Build a feature: task list.** Starting from a working framework scaffold with an empty
app, implement a list with a labeled "New task" input, an "Add task" button and three
filters: "All", "Active" and "Completed". Ignore blank/whitespace-only submissions;
trim added text and clear the input after success. Each task has a labeled completion
checkbox and a "Delete [task title]" button. Preserve insertion order and per-task
identity across filters. Show the active task count. Adding, completing, uncompleting,
deleting and switching filters must update the list correctly without a page reload.

**Fix a seeded bug: filtered task identity.** Begin with equivalent, otherwise passing
task-list implementations in each framework. Seed exactly one bug: toggling a visible
row uses its filtered array position as the position in the full list. With an earlier
completed item hidden by the Active filter, the wrong task changes. The prompt describes
the reproduction and expected identity behavior. The oracle covers this regression,
unfiltered toggles, changing filters and deletions. Retain the seeded source hash and
verify the seed fails the regression while the repaired reference passes every case.

**Add a validated form: signup.** Starting from an empty app, implement a form with labeled
"Name", "Email" and "I agree to the terms" controls and a "Sign up" submit button.
Name is trimmed and requires at least two characters; email must satisfy the browser's
email-input validity rules; agreement is mandatory. Invalid submission shows specific
field errors, marks invalid controls with `aria-invalid`, associates errors with their
controls, announces an error summary and focuses the first invalid control. Values remain
available for correction. Successful submission clears errors and announces the trimmed
name and submitted email. No network or persistence is required. Test mouse submission
and Enter from an input, multiple invalid fields, correction and successful submission.

These contracts are pilot task definitions, not benchmark results. Freeze their exact
prompts, scaffold sources and oracle before measured execution. If dry-run validation
changes a contract, record the revision before any measured trial; never alter an oracle
to rescue a measured failure.

## Execution and measurement

Create a fresh workspace for every run, containing its frozen scaffold, lockfile, prompt
and allowed documentation snapshot. No previous trial's transcript, solution or agent
session is available. The two Gyral conditions share byte-identical starting sources and
ordinary docs. Record checksums for every supplied file and the complete tool configuration.
Pin documentation snapshots from official sources; record their source URLs, revisions
and retrieval dates. Keep ordinary docs access equal across conditions. Disable arbitrary
web access and unrelated globally installed skills/MCP servers to prevent contamination.

Use three trial blocks. Each block contains all 12 task/condition combinations, shuffled
with a recorded deterministic seed. Save the final ordering before starting. Give every
run the same limits: 15 minutes of agent work, 24 model requests, 60 tool calls, 8,192
maximum output tokens per request and 65,536 cumulative completion tokens. Reserve a
request's maximum completion before dispatch against that cumulative limit. The provider
context limit is 131,072 tokens. The context guard uses the provider's actual prior input
count plus a conservative UTF-8-byte bound for newly appended text, a 4,096-token framing
reserve and the maximum output allocation. It does not reinterpret the entire accumulated
history as bytes on every request. Bounds are recorded separately from actual usage. Tools and
the final independent grade have finite deadlines; cleanup can extend the agent deadline
slightly. The final grade is outside the agent's 15-minute allocation. Count failed requests,
keep all reported cached/reasoning usage fields and stop on missing usage. There is no
monetary cap, by explicit owner authorization.

Each result contains the condition/task/trial ID, exact model/agent and settings, source
and context hashes, allowed tools, doc accesses and MCP calls, raw transcript, provider
usage, elapsed time, tool-call count, repair attempts, stopping reason and final outcome.
Use `null` with an explanation for unavailable usage counters; never substitute estimates
for provider-reported token totals. Keep cost estimates separately, with the price source
and timestamp. Never include credentials in artifacts.

Define a repair attempt as a source revision followed by a new verification after an
earlier failed verification. Repeating the same check without changing source does not
count as a repair. Save source hashes and check outcomes to make this count auditable.
Always run an independent final build/type check and the authoritative Chromium oracle
outside the agent's writable tree, even if the agent claims completion. Ignore agent edits
to its local tests for grading; protect oracle execution with filesystem/process isolation.

## Dry run, failures and reporting

Before paid runs, verify every framework scaffold builds and typechecks, all three
reference solutions pass the common oracle, incomplete feature/form scaffolds fail the
expected checks, and every seeded bug fails the same identity regression. Exercise fresh
workspace creation, context isolation, finite-limit refusal and evidence capture
with a fake agent, including failure paths. A fake-agent run is harness validation and
must not appear among the 36 measured trials.

Report every started trial, including time/token/tool-limit stops and failed outputs.
Classify provider outages, install failures and harness failures as infrastructure
failures, with raw evidence; show them in the attempted denominator. Do not silently
replace them or drop unfavorable results. Any replacement run must be separately labeled
with its reason and authorization. If the budget stops the pilot, report the completed
and unstarted counts and leave the bead open.

The report gives per-condition/task pass counts, token/tool/repair distributions, elapsed
time, usage availability and failures, with links to raw evidence and methodology.
Separate the two Gyral conditions. Three trials per cell are exploratory; this pilot does
not establish broad framework rankings or substantiate general "fewer tokens" claims.
The existing browser renderer benchmark measures a different question.

## Running and reviewing

Use an installed Docker engine, the pinned Node image named in `corpus.mjs`, and the
repository's Chromium installation. Rootless Docker maps container UID 0 to the host
owner; ordinary Docker uses the host UID. Builds and the released MCP server run without
network, capabilities or credentials, with read-only app/dependency mounts. Only the build
output and temporary directory are writable. Model file tools can write only `src/` and
cannot read the oracle, reference solutions, other trials or private configuration.
Browser HTTP access is restricted to the app's loopback origin; WebSockets and service
workers are blocked. No model-controlled package script is executed.

```sh
node scripts/agent-pilot.mjs prepare --out /private/pilot/corpus
node scripts/agent-pilot.mjs validate --corpus /private/pilot/corpus --out /private/pilot/validation
node scripts/agent-pilot.mjs freeze --corpus /private/pilot/corpus --validation /private/pilot/validation
node scripts/agent-pilot.mjs run --corpus /private/pilot/corpus --out /private/pilot/results --credentials /private/provider.json
```

The private credential JSON contains `baseUrl`, `model` and `apiKey`; keep it outside the
repository with mode 0600. The key goes only into the host HTTP authorization header.
Run directories are new and fail rather than overwrite evidence. `run --resume` skips
completed results, including failures, and refuses to replace an interrupted run.
Changing the corpus, CLI, fixtures, prompts, tools or oracle invalidates the freeze.

Open `results/report.html` for the condition/task table and every run's patch, transcript,
provider usage, browser checks and screenshot. Source is in each run's `app/src/`, and the
production build is in `final/dist/`. `report.md` and `summary.json` give portable summaries.
Setup/compatibility probes and fake-agent tests are separate from the measured 36 runs.
Context7 submission remains held until the owner provides its separate API key.

## Initial harness correction

The first frozen revision (`62839d3`) completed two initial attempts before a safe batch
stop. Its whole-history byte guard stopped the assisted trial at 26,535 provider-reported
input tokens, far below the model window. Its browser oracle also rejected valid
`aria-live` announcements because it required `role="status"`. These are harness failures.
The original sources, transcripts, usage and outcomes are preserved without rewriting.

The revised guard uses actual prior input usage, and the oracle accepts equivalent native
labels, ARIA labels and live regions. Six additional live-region reference variants join
the original 18 positive/negative checks. Run the corrected 36-trial pilot in a new
directory with `--prior /private/pilot/initial-results`; correction/replacement work falls
within the owner's instruction to complete this pilot with unlimited monetary spend.
The report retains initial attempts separately and states the total attempted denominator
across revisions, alongside usage from both revisions. Comparative cells use the corrected
protocol's trials only. Setup probes remain separately identified.

## Completed pilot results — 2026-10-11

All **36 corrected trials completed: 19 passed, 17 failed**, with no infrastructure
failures. Every corrected failure reached the 24-request limit. Measured execution used
source commit `8e0d1c419ca35ee9ccaa99863cd331b1ca6dfcda`, whose required
[repository gate passed](https://github.com/gyraljs/gyral/actions/runs/38169918296).

| Condition            | Feature | Bug | Form | Total |
| -------------------- | ------- | --- | ---- | ----- |
| Gyral ordinary docs  | 0/3     | 0/3 | 0/3  | 0/9   |
| Gyral skill + MCP    | 0/3     | 2/3 | 0/3  | 2/9   |
| React ordinary docs  | 3/3     | 2/3 | 3/3  | 8/9   |
| Svelte ordinary docs | 3/3     | 3/3 | 3/3  | 9/9   |

Sixteen Gyral failures made **no source edits** while exploring documentation/APIs.
The failed React bug trial fixed the identity lookup but introduced a JSX syntax error;
its final typecheck and build failed. A pass certifies the frozen type/build/browser
contract, rather than complete consumer lint or code-quality coverage. The simple fixed
agent loop did not expose its remaining request budget. These observations motivate
agent/documentation calibration before another comparative study; three trials per cell
and differing model familiarity do not support general framework rankings.

| Condition            | Median tokens | Median tool calls | Median repairs | Median agent seconds |
| -------------------- | ------------: | ----------------: | -------------: | -------------------: |
| Gyral ordinary docs  |       808,648 |                26 |              0 |               97.617 |
| Gyral skill + MCP    |       486,801 |                30 |              0 |               67.789 |
| React ordinary docs  |        96,512 |                13 |              0 |               42.636 |
| Svelte ordinary docs |        54,332 |                10 |              0 |               40.149 |

All measured runs have complete actual provider counters: **12,539,436 tokens across
578 requests**. The two preserved initial attempts consumed 493,204 tokens, making
**38 completed attempts and 13,032,640 tokens** across revisions. Compatibility probes
consumed another 666 tokens, separately excluded from measured totals. Dollar cost remains
unavailable. The largest measured request reported 83,311 input tokens. Elapsed time
includes API/tool overhead on a host with concurrent workloads; it is not a controlled
framework runtime performance benchmark.

The private review bundle is `2026-10-11-qwen38-v2.tar.gz`, SHA-256:

```
593d94052fc88d80cbfd103bc7c70fd7a161d7fab6562d0654a6cc0a09158a59
```

Start with its `report.html`: all 36 rows link to patches, transcripts, independent
checks and screenshots when available. `summary.json` includes full distributions;
`initial-attempts.html` links to both unchanged initial attempts. The bundle also retains
frozen docs/skill/MCP context, registry lockfiles, environment provenance, the measured
harness archive, all 24 reference/negative validation results and a per-file checksum
manifest. All review links resolve, browser accessibility checks report zero violations,
and a final credential scan passed. Report-only postprocessing omits links to absent
screenshots; measured sources, outcomes, usage and transcripts remain unchanged.

# Agent benchmark pilot protocol

Track this work in `gyral-7se.10`. The owner approved three tasks, four conditions and
three independent trials per task/condition: **36 measured runs**. This protocol defines
the pilot's behavioral contracts and measurements. Scaffolds, the browser oracle and a
provider-specific runner still need implementation and a successful local dry run;
there are no measured results yet.

## Conditions and versions

| Condition        | Framework              | Additional assistance                                |
| ---------------- | ---------------------- | ---------------------------------------------------- |
| `gyral-docs`     | `@gyral/core` 0.3.1    | Ordinary consumer docs                               |
| `gyral-assisted` | `@gyral/core` 0.3.1    | The same docs, released skill and `@gyral/mcp` 0.3.1 |
| `react-docs`     | React/React DOM 19.3.0 | Ordinary official docs                               |
| `svelte-docs`    | Svelte 5.57.2          | Ordinary official docs                               |

Versions were checked against the npm registry on 2026-10-11. Install exact versions
from npm in independent projects, without the renderer benchmark repository's overrides
or vendor packages. Commit the generated lockfiles before freezing the corpus.

Use one fixed agent/model/version/settings for every condition. These choices, the access
method and a hard maximum total spend are pending the owner. Do not execute measured runs
until they are recorded and the runner enforces the agreed limits. The assisted condition
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
run the same wall-clock, input/output-token and tool-call limits. Also enforce the hard
total spend: reserve each run's worst-case priced usage before dispatch, count failed
requests and cached/reasoning tokens according to provider billing, and stop if the next
run could exceed the cap. A wall-clock timeout alone is not a cost limit. If the selected
runner cannot expose or bound billable usage, fix that before execution.

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
workspace creation, context isolation, timeouts, cost-cap refusal and evidence capture
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

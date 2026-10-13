# Agent benchmark pilot protocol v3

Track this work in `gyral-7se.13`. The owner approved a two-run plan on 2026-10-12: fix the
harness (H1–H7, below), then **Run A** (`gyral-7se.21`) on this protocol with today's docs and
MCP; then ship the documentation, MCP and type fixes and run **Run B** (`gyral-7se.31`) on the
same protocol. This document defines protocol v3. It does not change the
[original pilot](agent-benchmark-pilot.md): its frozen 36 results stay as recorded, and v3
results are never pooled with them or used to rescore them.

## Versions of this protocol

| Protocol | Harness revision | Status                                                                                                                      |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| v1       | `62839d3`        | Two initial attempts, stopped by a harness defect; preserved separately                                                     |
| v2       | `8e0d1c4`        | The completed 36-run pilot (19 passed), [recorded here](agent-benchmark-pilot.md)                                           |
| v3       | this document    | Harness ready and validated with a scripted mock agent. Run A and Run B are not started; the owner starts each measured run |

## What changed from v2, and why

The [transcript review](ecosystem-review/agents.md) found that the v2 harness, not only the
framework, shaped the Gyral results. Each change below fixes one observed failure. Every change
applies identically to all four conditions; none adds a framework-specific hint.

| Item                                   | Observed in v2                                                                                                                                                                                                                                                                                              | v3 change                                                                                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 (`gyral-7se.15`): doc shape         | Gyral got one 654 KB file (gyral.dev `llms-full.txt`); React and Svelte got five hand-picked pages each                                                                                                                                                                                                     | Every framework gets the same shape: its official llms.txt-style index plus every listed page's Markdown, fetched from react.dev, svelte.dev and gyral.dev and frozen with retrieval dates and SHA-256 hashes                         |
| H2 (`gyral-7se.16`): doc tools         | `read_doc` was a case-insensitive substring search with an offset. `# Testing` matched `## Testing stores`; query plus offset found the same match again (12 identical calls in one run); 53 of 190 Gyral reads returned text already seen; `# Update` found nothing because the page is "Model and update" | `list_docs`, `get_doc(page, section?)` and a ranked `search_docs` replace `read_doc`. Section lookup prefers exact headings. A repeated read is answered with a warning naming the earlier request                                    |
| H3 (`gyral-7se.17`): budget            | The 24-request budget was invisible. A diagnostic "4 requests remain, implement now" prompt produced writes at once                                                                                                                                                                                         | Every tool result carries "Model request N of 24 used; M remaining." One checkpoint message after request 12 if no source file has been written                                                                                       |
| H4 (`gyral-7se.18`): context growth    | Gyral prompts reached 67–83K tokens by request 24, against 3–20K for React and Svelte                                                                                                                                                                                                                       | Older tool output is replaced by short stubs; the four most recent results stay in full. The transcript keeps everything                                                                                                              |
| H5 (`gyral-7se.19`): MCP bridge        | The bridge forwarded only `listTools()`. Server instructions and the `build-gyral-component` prompt were dropped; `get_example`, `scaffold_component` and `check_snippet` were never called in nine assisted runs                                                                                           | The bridge forwards the server's `instructions` into the system prompt, exposes prompts through `mcp_get_prompt` and resources through `mcp_read_resource`. Tested against the real `packages/mcp` server                             |
| H6 (`gyral-7se.14`): generated output  | `/app` was read-only; an exported component's element typings could not create `/app/.gyral`, and the failure was scored as an app failure                                                                                                                                                                  | A fresh writable directory per check is mounted at `/app/.gyral`; source, dependencies and oracle stay read-only. Permission and cache failures are classified as infrastructure. Validation includes an exported, two-file component |
| H7 (`gyral-7se.20`): bug fixture idiom | The Gyral bug fixture read `data-id`/`data-index` attributes and passed intents through `pick`; the docs teach `value=${id}` read as `({ value })` and a module-level `intentsOf`. All six Gyral bug runs looked up `intentsOf`; passing runs rewrote the fixture                                           | Each framework's bug fixture follows that framework's documented idiom. The seeded defect is the same in all three: one expression uses a row's filtered position as a position in the full list                                      |

The assisted condition keeps the released skill and MCP **on top of** the same base docs:
its documentation tools see the same Gyral pages as the ordinary-docs condition, plus the
released skill's pages.

## What stays the same

- **Model and settings.** Blueclaw's `Qwen3.8-27B`, temperature 0.2, non-streaming Chat
  Completions, through the existing private provider configuration (`baseUrl`, `model`,
  `apiKey`), which lives outside the repository with mode 0600. Credentials are never
  committed or written to evidence; the harness refuses a tool output that contains the key.
- **Design.** Three tasks (feature, seeded bug, form) × three trials × four conditions
  (`gyral-docs`, `gyral-assisted`, `react-docs`, `svelte-docs`): 36 runs, in three shuffled
  trial blocks with the recorded seed 20261011.
- **Limits.** 15 minutes of agent work, 24 model requests, 60 tool calls, 8,192 output tokens
  per request, 65,536 cumulative completion tokens, the 131,072-token context guard.
- **Contracts and oracle.** The task prompts, the protected type/build/Chromium oracle and the
  independent final grade are unchanged. The prompt now names the new documentation tools
  and states the 24-request budget.
- **Versions.** Run A uses `@gyral/core` and `@gyral/mcp` 0.3.1, React 19.3.0 and Svelte 5.57.2
  from npm. Run B passes `--gyral-version` for the release that carries its fixes.
- **Evidence rules.** New output directories only, no silent replacement, every started run
  reported, infrastructure failures in the denominator, raw transcripts, requests, responses,
  usage and patches kept.

## Documentation tools

`list_docs` returns the index summary and one line per page:
`page id | title (group): description`. The description is the index's own description when it
has one, otherwise the page's frontmatter description, otherwise its first prose paragraph,
cut to 140 characters. The same rule applies to every framework.

`get_doc(page, section?)` takes a page id (a URL or exact title also works). Without a section
it returns the page; a page longer than 12,000 characters returns its first 12,000 and an
outline of its headings. A section is resolved by exact heading (or heading path) first, then
by the best word overlap of at least half; a fuzzy match says which heading it chose, and a
miss returns the outline. Headings inside code blocks are ignored.

`search_docs(query, limit?)` ranks every section's own text: a query word in the section
heading scores 4, in the page title 2, in the page description 1, and body frequency adds up
to 3 (log-scaled). A multi-word query gains a bonus when the whole phrase appears. Results give
page id, section path, score and a snippet; ties keep index order. It returns at most 10.

A read counts as a **repeat** when it returns content already returned in the run: the same
page extent for `get_doc` (so a page and its whole-page H1 section are one read), the same
keyword set for `search_docs`, the same arguments for MCP lookups. The tool still answers,
prefixed by `Repeat read: this returns the same content as your call in request N.`

Snapshot sizes on 2026-10-12, for scale: Gyral 52 pages (722 KB), React 179 pages (3.1 MB),
Svelte 86 pages (480 KB). Svelte's root `llms.txt` links only whole-documentation files, so
its per-page index is the Svelte package's page list from `sveltejs/svelte`
`documentation/docs` at a recorded revision, each linked to svelte.dev's per-page Markdown
endpoint (`/docs/svelte/<page>/llms.txt`). The React and Gyral indexes are their sites'
`llms.txt` as published. `sources.json` in each frozen docs directory records every page's
URL, hash, size, retrieval time and HTTP validators.

## Budget, checkpoint and compaction

Every tool result is JSON `{ "budget": "...", "result": ... }`, where the budget line reads
`Model request N of 24 used; M remaining.` If request 12 ends without a successful
`write_file`, the harness adds one user message before request 13:

> Checkpoint: 12 of 24 model requests are used and no source file has been written yet. 12
> requests remain. Write your implementation under src/ with write_file, then run check; its
> results show what still fails.

It is sent at most once and only in that case, in every condition.

Compaction runs before each request. Tool results other than the four most recent, and longer
than 600 characters, are replaced by a stub that keeps the budget line and a one-line summary
(for example `Read docs/intent › Lists (8,412 characters)` or
`Check failed (type 0, build 0; failing: filtered task identity)`), and says the tool can be
called again. The message count never changes, the full history stays in `transcript.json`,
and each `request-N.json` holds exactly what was sent.

## MCP bridge

For the assisted condition, the server's `initialize` instructions are appended to the system
prompt. MCP tools keep their `mcp_` names. Because the model can call only functions, prompts
are exposed through `mcp_get_prompt(name, arguments)`, whose description lists each prompt and
its arguments, and resources through `mcp_read_resource(uri)`, whose description lists the
resources and templates (`gyral://llms.txt`, `gyral://skill`,
`gyral://skill/references/{name}`). The released server still answers from its own bundled
docs snapshot.

## Sandbox

Builds, typechecks and the MCP server run in the pinned Node image without network,
capabilities or credentials. `/app` and its `node_modules` are read-only bind mounts. Each
check gets a new, empty host directory mounted writable at `/app/.gyral` (precreated as an
empty mountpoint in every workspace, for all frameworks) and kept with that check's evidence,
so generated output never carries over between checks. The build output and `/tmp` are the
only other writable paths. A type or build failure whose log shows `EACCES`, `EROFS`, `EPERM`,
"read-only file system" or "permission denied" is recorded as an infrastructure failure, and the
agent is told the failure was the harness's.

## Fixture review against each framework's docs

| Framework | Idiom used, and where the docs teach it                                                                                                                                                                                                                                                                                                                                                             | Seeded expression → correct expression                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Gyral     | Rewritten. Exported `define` with typed `State` and `Msg` (Getting started); a module-level `intentsOf<typeof App>()` and a row that reads only its item, its `pick` value and module constants, with an explicit `TemplateResult` return and the view's own `i` (Views › Lists); `value=${item.id}` parsed as `({ value })`, `Add: true` (Intent); one pure reducer per message (Model and update) | `s.items[shown.indexOf(item)]?.id` → `item.id` (in `pick`) |
| React     | Kept. Function component with `useState`, controlled input with `value`/`onChange`, `onSubmit` with `preventDefault` (Responding to Events, `<input>`); `map` with `key={item.id}` (Rendering Lists); replacing and removing array items with `map`/`filter` (Updating Arrays in State)                                                                                                             | `items[index]?.id` → `item.id`                             |
| Svelte    | Kept. `$state` and `$derived` runes, `bind:value`, event attributes (`onsubmit`, `onclick`, `onchange`), keyed `{#each visible as item, index (item.id)}` (Runes, Basic markup, `{#each}`, `bind:`). The docs also show `bind:checked` on an item; the explicit handler keeps the defect in the same place as React                                                                                 | `items[index]?.id` → `item.id`                             |

In each framework the seeded and repaired fixtures differ in exactly one line. Validation
checks that each seed fails only the `filtered task identity` case and each repair passes all
cases.

## Measurements

Each `result.json` keeps the v2 fields (outcome, stop reason, usage, tool calls, repairs,
checks, accesses, hashes) and adds:

| Field                               | Meaning                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `firstWriteRequest`                 | Model request whose tool calls first wrote a source file (`null` if none)                                                 |
| `firstCheckRequest`                 | Model request whose tool calls first ran `check`                                                                          |
| `sourceWrites`                      | Successful `write_file` calls                                                                                             |
| `toolUse`                           | Calls per tool name                                                                                                       |
| `docCalls`                          | `list_docs`, `search_docs`, `get_doc` and MCP lookups (`search_docs`, `get_doc`, `get_api`, examples, prompts, resources) |
| `repeatReads`                       | Documentation calls that returned content already returned in the run                                                     |
| `usefulMcpTools`                    | `mcp_scaffold_component` plus `mcp_check_snippet` calls                                                                   |
| `checkpointAfterRequest`            | 12 when the checkpoint was sent, otherwise `null`                                                                         |
| `compactedToolResultsAtLastRequest` | Stubs in the last request sent                                                                                            |

The report gives pass counts per condition and task; per condition the runs without a source
write, median first write and first check, repeat reads over documentation calls, checkpoint
runs, runs using `scaffold_component` or `check_snippet`, tool use and token distributions;
and the success criteria below, each marked met or not met.

## Success criteria

These are the targets from `gyral-7se.31`. Run B is judged against them; Run A reports them
too, to show how much of the v2 gap the harness fixes alone close.

| Criterion                                                                              |
| -------------------------------------------------------------------------------------- |
| Gyral ordinary docs pass at least 7 of 9 runs                                          |
| No Gyral ordinary-docs run ends without a source write                                 |
| Median first write in Gyral ordinary-docs runs is request 10 or earlier                |
| Gyral assisted passes at least 8 of 9 runs                                             |
| Gyral assisted calls `scaffold_component` or `check_snippet` in at least half the runs |
| Repeat reads are at most 10% of Gyral documentation calls                              |

Three trials per cell remain exploratory. Neither run establishes a general framework ranking.

## Mock validation

`run --mock` replaces the model with a scripted agent and changes nothing else: it uses the
frozen corpus, the real tools, the real MCP server in its sandbox, the real grader and the
report. The script reads the index, searches, reads the top result twice (one repeat), and in
the assisted condition fetches the MCP prompt, a skill resource and an MCP search. Trial 1 then
writes the unchanged starter, checks, writes the reference and checks again (one repair);
trial 2 writes the reference and checks; trial 3 keeps reading pages until the checkpoint
arrives, then writes and checks. Mock usage counts are request bytes divided by four; they are
not provider tokens. Mock runs are harness validation and never measured trials; the plan and
every report carry a MOCK banner, and `--resume` refuses to mix mock and measured runs.

**Validation on 2026-10-12** (harness commit `8cb22d4`): `prepare` froze 52 Gyral, 179 React
and 86 Svelte pages with none unavailable (Svelte page list at `sveltejs/svelte@707c281`).
`validate` matched all 26 expected outcomes: nine references pass, nine starters fail as
expected (each bug seed fails only `filtered task identity`), six live-region variants pass,
and the exported two-file Gyral component passes twice, each time writing
`elements.d.ts` only to that check's own mount and leaving the app tree untouched. `freeze`
then recorded the commit and hashes. The mock run completed **36 of 36 runs, all passing, with
no infrastructure failures**, in 5 minutes 48 seconds, including the real MCP server in its
sandbox for all nine assisted runs. It exercised every v3 path: budget lines on every tool
result, the checkpoint in all 12 trial-3 runs (first write at request 13), one repair in each
trial-1 run, repeat-read warnings, compaction stubs, MCP instructions, prompt and resource
reads, and generated typings in the 12 Gyral runs whose final source exports a component. Its
report evaluates the success criteria; the scripted agent misses two by design (it never calls
`scaffold_component` or `check_snippet`, and repeats one read in every run). Those numbers
validate the harness only, not any framework.

The corpus, validation and mock results are outside the repository, under
`~/.local/share/gyral-agent-pilot/`: `corpus-protocol-v3-2026-10-12`,
`validation-protocol-v3-2026-10-12` and `runs/2026-10-12-protocol-v3-mock`.

## Running

```sh
P=~/.local/share/gyral-agent-pilot
node scripts/agent-pilot.mjs prepare --out $P/corpus-<date>
node scripts/agent-pilot.mjs validate --corpus $P/corpus-<date> --out $P/validation-<date>
node scripts/agent-pilot.mjs freeze --corpus $P/corpus-<date> --validation $P/validation-<date>
node scripts/agent-pilot.mjs run --mock --corpus $P/corpus-<date> --out $P/runs/<date>-mock
node scripts/agent-pilot.mjs run --corpus $P/corpus-<date> --out $P/runs/<date>-run-a \
  --credentials $P/blueclaw.json
```

`prepare` fetches and freezes the docs and installs the seeds and the released MCP; it accepts
`--gyral-version` (default 0.3.4). `validate` needs Docker and Chromium and runs 26 grades.
`freeze` records the commit and the hashes of the harness and corpus; changing the harness,
fixtures, prompts or corpus afterwards makes `run` refuse to start. Run `prepare` on the day of
the measured run so "today's docs" are what get frozen. `report --out <dir>` rebuilds the
reports from saved results.

`run --only gyral-docs` (a comma-separated list of conditions) runs a subset of the ordering;
`--resume` must name the same subset. An agent the harness does not drive, such as a Claude Code
subagent, takes trials through a local bridge with the same prompt, tools, budget, checkpoint
and grader:

```sh
node scripts/agent-pilot.mjs serve --corpus $P/corpus-<date> --out $P/runs/<date>-<agent> \
  --model <agent model> --only gyral-docs --port 47311
node scripts/agent-pilot.mjs call --port 47311 --trial <run id> start pilot   # prints the prompt
# the agent's one shell command: call --port 47311 --trial <run id> <tool> | write | batch
node scripts/agent-pilot.mjs call --port 47311 --trial <run id> finish [total tokens]
```

Each `call` is one request and may carry several tool calls (`batch`). The bridge cannot see
the agent's own context or token use; a source change made other than through `write_file`
fails the trial (`outOfBand`). There is no MCP condition through the bridge.

### Run A

Run A (`gyral-7se.21`) is started by the owner. On the day, from a checkout of `main` that
contains this protocol:

```sh
P=~/.local/share/gyral-agent-pilot
D=$(date +%F)
node scripts/agent-pilot.mjs prepare --out $P/corpus-protocol-v3-$D-run-a
node scripts/agent-pilot.mjs validate --corpus $P/corpus-protocol-v3-$D-run-a \
  --out $P/validation-protocol-v3-$D-run-a
node scripts/agent-pilot.mjs freeze --corpus $P/corpus-protocol-v3-$D-run-a \
  --validation $P/validation-protocol-v3-$D-run-a
node scripts/agent-pilot.mjs run --corpus $P/corpus-protocol-v3-$D-run-a \
  --out $P/runs/$D-protocol-v3-run-a --credentials $P/blueclaw.json
```

Expected cost: v2 used 12.5 million provider tokens over 578 requests, mostly because Gyral
prompts grew to 67–83K tokens. With compaction, the mock's requests stayed between 1K and 17K
estimated tokens. A run that uses all 24 requests with large reads should cost roughly 250–500K
tokens, and an early finish under 100K, so 36 runs should total about 5–12 million tokens,
not more than v2. The practical ceiling, if every run used all 24 requests at about 30K
tokens each, is about 26 million. Expected duration: about 50 minutes for the 36 runs (v2 took
47), plus a minute for `prepare` and about 5 minutes for `validate`. There is no monetary cap
in the harness; the request, tool, token and time limits above bound each run.

## Results, 2026-10-12

Both runs used the same model, settings, tasks, oracle and harness (main 985e5da for Run A,
c566d1b for Run B; the harness code is identical between them). Evidence is under
`~/.local/share/gyral-agent-pilot/runs/2026-10-12-protocol-v3-run-a/` and `…-run-b/`
(`report.md`, `summary.json`, every request, response, patch, grade and screenshot).

| Condition      | v2 (2026-10-11) | Run A: fair harness | Run B: + docs, MCP, types |
| -------------- | --------------: | ------------------: | ------------------------: |
| Gyral docs     |             0/9 |                 1/9 |                   **7/9** |
| Gyral assisted |             2/9 |                 3/9 |                       4/9 |
| React docs     |             8/9 |                 8/9 |                       8/9 |
| Svelte docs    |             9/9 |                 7/9 |                       7/9 |

| Gyral docs, process         |  Run A | Run B |
| --------------------------- | -----: | ----: |
| Runs without a source write |      6 |     1 |
| Median first write          |     24 |   8.5 |
| Repeat reads / doc calls    | 86/198 |  7/90 |
| Median tokens per run       |   194K |  122K |

**Run A** (docs frozen at 09:05, before the recipes and `llms-small.txt` were deployed; MCP
before PR #13) shows the harness fixes explain little: the docs-only agent still cycled
through the same five sections (Getting started, Intent, Views › Lists) and wrote at request 24
or never; the assisted agent walked generic types (`ComponentSpec`, `IntentField`,
`SpecBody`, `ParserFor`) and never used `scaffold_component` or `check_snippet`.

**Run B** adds the recipes page, the native-first Forms page, `llms-small.txt` (first in
`llms.txt`), "Use when" index entries, and the MCP/type changes of PR #13. The docs-only
condition reaches 7/9 (Svelte's score in the same run): feature 3/3, bug 3/3, form 1/3. Of the
gyral-7se.31 criteria, "docs ≥ 7/9" is met; "median first write ≤ 10" is reported as not met
because one run never wrote (the criterion requires every run to write); repeat reads are
26/259 across both Gyral conditions (10.04%, limit 10%).

Remaining failures:

- **Assisted form runs (0/3)** open the skill's `forms.md`, which teaches the schema path,
  then query `get_api` for `form`, `FormDefinition`, `Errors` and other types until the budget
  runs out (`gyral-assisted-form-1` asked for `Errors` seven times in a row). None called
  `start_here`, `scaffold_component` or `check_snippet`, though every tool description now names
  them.
- **One docs form run** split the component into `src/signup-form.ts` without importing it
  from `main.ts`, so the element was never defined and every browser case timed out.
- **One assisted feature run** ended with a syntax error after two repairs.

Follow-ups are tracked under gyral-7se.

**Correction, 2026-10-13: Run B ran the 0.3.1 packages.** Both corpora were prepared with the
harness default of the day, `--gyral-version` 0.3.1 (`frozen.json` of each records
`"gyralVersion": "0.3.1"`; Run B froze at 13:58 UTC, and 0.3.2 reached npm at 16:36 UTC). So
the assisted condition in Run B used `@gyral/mcp` 0.3.1 and the skill bundled with it: its tool
list has no `start_here`, `scaffold_component` offers no `form-native`, the tool descriptions
carry no workflow, and the server instructions say "Read the gyral://skill resource first"
(`request-1.json` of any assisted run). The seeds used `@gyral/core` 0.3.1 too. Run B therefore
measured the gyral.dev changes, not PR #13's MCP and type changes, and the sentence above about
tool descriptions does not hold for it. A later run measures MCP and skill changes only when
`prepare` gets `--gyral-version` for a published release that contains them: the harness
installs `@gyral/mcp` from npm and refuses a corpus whose MCP version differs.

## Run C, 2026-10-13: published 0.3.3

Run C repeats the protocol unchanged with `--gyral-version 0.3.3` (harness at gyral `414a3e1`,
corpus hash `5f06d3f9a8fe`). It is the first run whose assisted condition has the PR #13 and
0.3.3 MCP server: `start_here`, the `form-native` scaffold and the workflow in the tool
descriptions. The docs come from gyral.dev as of 07:26 UTC, including the entry-import rule
(gyral-7se.34). Not included: PR #18. The sandbox image (`sha256:3880cf50…`) had been removed
from the host and was restored as `node:24.15.0-bookworm-slim`, whose ID matches (gyral-jl5).

Five trials (one in each Gyral condition, two Svelte, one React) failed before the first model
response with provider HTTP 502/503. Their evidence is kept in `provider-failures/`, and they
were re-run once with `run --resume` against the same frozen corpus and plan.

| Condition      | Feature | Bug | Form | Total | Runs using scaffold/check_snippet |
| -------------- | ------: | --: | ---: | ----: | --------------------------------: |
| gyral-docs     |     3/3 | 3/3 |  1/3 |   7/9 |                                 — |
| gyral-assisted |     0/3 | 3/3 |  0/3 |   3/9 |                               2/9 |
| react-docs     |     2/3 | 3/3 |  3/3 |   8/9 |                                 — |
| svelte-docs    |     3/3 | 3/3 |  2/3 |   8/9 |                                 — |

- **`start_here` is used, and is not enough.** Every assisted run called `start_here` first
  (none in Run B, where the tool did not exist). The three bug runs passed in 8 to 13 requests,
  one with `check_snippet`. Every feature and form run then called `get_example` and went on to
  15–35 `get_api` calls in a row (`ComponentSpec`, `IntentParser`, `ParserFor`, `Reducer`,
  `Next`; for forms also a detour from `focus` into `defineDriver`, `DriverContext` and
  `CommandHandlers`), and ran out of requests, mostly before writing a file. This is the
  behaviour PR #18 addresses: usage and the next call in `get_api` answers, the nudge from the
  fourth call, and the task-grouped index.
- **Docs-only forms still fail (1/3).** Both failing runs re-read the Intent page 10 times or
  more and the Forms page 4–6 times without writing (28 and 26 tool calls). The page they need
  for a form's submit intent is not where they look first.
- Docs-only feature and bug stay 6/6; no run left a component module unimported.

## Run D, 2026-10-13: published 0.3.4

Run D repeats the protocol unchanged with `--gyral-version 0.3.4` (harness at gyral `9b741e5`):
the MCP server and skill of PR #18 (`get_api` usage and next call, the nudge, the task-grouped
index, native-first skill forms) and gyral.dev on 0.3.4, including the Forms page's complete
example (gyral-7se.36). The model provider was unstable during the run. Trials that failed with
provider errors were re-run twice against the same frozen corpus and plan; every attempt's
evidence is kept under `provider-failures/`. Four trials still ended as infrastructure failures
(two Gyral docs, one React, one Svelte) and count in the denominators below.

| Condition      | Feature | Bug | Form | Total | Runs using scaffold/check_snippet |
| -------------- | ------: | --: | ---: | ----: | --------------------------------: |
| gyral-docs     |     2/3 | 2/3 |  1/3 |   5/9 |                                 — |
| gyral-assisted |     2/3 | 3/3 |  3/3 |   8/9 |                               8/9 |
| react-docs     |     2/3 | 2/3 |  3/3 |   7/9 |                                 — |
| svelte-docs    |     3/3 | 3/3 |  2/3 |   8/9 |                                 — |

- **Assisted meets both gyral-7se.31 criteria** (≥ 8/9 passes; scaffold or `check_snippet` in
  ≥ half the runs), against 3/9 and 2/9 in Run C. Bug runs take 7 tool calls (`start_here`,
  `check_snippet`, write, check); form runs pass in 12–13 calls from the `register` example or
  the `form-native` scaffold; median first write moves from request 8 to 5. No run walked types
  with `get_api`. The one failure (feature-3) read ten or more examples in a row with
  `get_example`, which the nudge does not count (gyral-7se.37).
- **Docs-only: 5 passes of the 7 trials that reached the end.** Feature and bug pass 4 of 5;
  form-1 found the complete example but spent its last requests on a syntax error, and
  feature-3 read the API reference type by type until the budget ran out. With two provider
  failures in the denominator the criterion "≥ 7/9" is not met in this run.

## Run E, 2026-10-13: Run D repeated

Run E repeats Run D unchanged: harness `9b741e5`, the same frozen corpus (`d92f290fd203`) and
plan. No trial failed at the provider.

| Condition      | Feature | Bug | Form | Total | Runs using scaffold/check_snippet |
| -------------- | ------: | --: | ---: | ----: | --------------------------------: |
| gyral-docs     |     1/3 | 3/3 |  1/3 |   5/9 |                                 — |
| gyral-assisted |     2/3 | 3/3 |  2/3 |   7/9 |                               8/9 |
| react-docs     |     2/3 | 3/3 |  2/3 |   7/9 |                                 — |
| svelte-docs    |     3/3 | 3/3 |  2/3 |   8/9 |                                 — |

- **Docs-only stays at 5/9, and part of the cause is the harness.** Gyral's `llms.txt` links
  the condensed `llms-small.txt`, but the corpus parser kept only `.md` links, so docs-only
  agents could not open it. The React and Svelte indexes link no `.txt` pages, so only Gyral
  lost a page. The median first write was request 13, the checkpoint; six of the nine runs
  opened the API reference, and the two failing feature runs read it 21 and 8 times.
- form-1 dropped a bracket copying the Forms example's `[state, commands]` return, as in
  Run D (gyral-7se.39); form-3 wrote `<SignupForm>` for a custom element tag (gyral-7se.35).

## Run F, 2026-10-13: index parser and API reference fixes, docs-only

Run F runs only the Gyral docs-only condition (`--only gyral-docs`) at harness `294cbba`,
whose parser keeps `.txt` index links, so `llms-small.txt` is reachable. Two corpora are Run
D's frozen corpus with the Gyral docs rebuilt from local builds of gyral.dev: **A** from
`f5f0d9b` (then live) and **B** from `a5f67e7`, whose API reference pages open by sending readers
to Recipes and Forms and say most types are inferred (gyral-7se.38). Provider failures (HTTP
502/503 from upstream) were re-run; their evidence is kept in `provider-failures/`.

The same nine trials on corpus B were also taken by Claude Sonnet 5.5 (Claude Code
subagents, harness `700022c`, which only makes the bridge prompt's example page id neutral)
through the bridge. Every subagent transcript was checked: each ran only the bridge command.

| Run              | Feature | Bug | Form | Total | Median first write | Runs opening the API reference |
| ---------------- | ------: | --: | ---: | ----: | -----------------: | -----------------------------: |
| Run E (Qwen)     |     1/3 | 3/3 |  1/3 |   5/9 |                 13 |                            6/9 |
| F-A (Qwen)       |     2/3 | 3/3 |  2/3 |   7/9 |                  5 |                            1/9 |
| F-B (Qwen)       |     3/3 | 3/3 |  2/3 |   8/9 |                  6 |                            0/9 |
| F-B (Sonnet 5.5) |     3/3 | 3/3 |  3/3 |   9/9 |                  3 |                            0/9 |

- **Most of the gain is the parser fix.** With `llms-small.txt` reachable, every Qwen run read
  it within its first four requests, and the median first write moved from request 13 to 5–6,
  with or without the docs change.
- **The API reference change did what it was for.** No B run opened the API reference; in A,
  form-1 read it 11 times and ran out of requests. One trial apart, A and B are not
  distinguishable at three trials per cell.
- **The remaining Qwen failures are known patterns.** A feature-3 wrote `<TaskApp></TaskApp>`
  for `<task-app>`, so nothing rendered (gyral-7se.35); B form-1 dropped a bracket in the
  Forms example's `[state, commands]` return, the third time (gyral-7se.39). B form-3 passed
  with its write on the last request.
- **Sonnet 5.5 passed every trial in 3–4 requests** (35–51K tokens as reported by Claude Code),
  after reading Forms (form runs), `llms-small.txt` and Recipes (five runs), or nothing (one
  bug run). Its results are not comparable with Qwen's: it manages its own context, and its
  usage is reported by its host.

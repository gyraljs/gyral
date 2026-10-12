import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONDITIONS, TASKS, save } from './corpus.mjs';
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
function distribution(values) {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    available: sorted.length,
    missing: values.length - sorted.length,
    min: sorted[0] ?? null,
    median: sorted.length
      ? sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      : null,
    max: sorted.at(-1) ?? null,
  };
}

/** Process metrics per condition (protocol v3). */
export function conditionMetrics(runs) {
  const docCalls = runs.reduce((sum, result) => sum + (result.docCalls ?? 0), 0);
  const repeatReads = runs.reduce((sum, result) => sum + (result.repeatReads ?? 0), 0);
  const toolUse = {};
  for (const result of runs)
    for (const [name, count] of Object.entries(result.toolUse ?? {}))
      toolUse[name] = (toolUse[name] ?? 0) + count;
  return {
    attempted: runs.length,
    passed: runs.filter((result) => result.passed && !result.infrastructure).length,
    infrastructure: runs.filter((result) => result.infrastructure).length,
    runsWithoutSourceWrite: runs.filter((result) => !result.firstWriteRequest).length,
    firstWriteRequest: distribution(runs.map((result) => result.firstWriteRequest)),
    firstCheckRequest: distribution(runs.map((result) => result.firstCheckRequest)),
    checkpointRuns: runs.filter((result) => result.checkpointAfterRequest).length,
    docCalls,
    repeatReads,
    repeatReadShare: docCalls ? repeatReads / docCalls : null,
    runsUsingScaffoldOrCheckSnippet: runs.filter((result) => (result.usefulMcpTools ?? 0) > 0)
      .length,
    toolUse,
  };
}

/** gyral-7se.31 success criteria, evaluated on the completed runs. */
export function criteria(metrics) {
  const docs = metrics['gyral-docs'];
  const assisted = metrics['gyral-assisted'];
  const gyral = [docs, assisted];
  const docCalls = gyral.reduce((sum, entry) => sum + entry.docCalls, 0);
  const repeats = gyral.reduce((sum, entry) => sum + entry.repeatReads, 0);
  const rows = [
    ['Gyral docs passes >= 7/9', `${docs.passed}/${docs.attempted}`, docs.passed >= 7],
    [
      'Gyral docs: no run without a source write',
      `${docs.runsWithoutSourceWrite} without a write`,
      docs.attempted > 0 && docs.runsWithoutSourceWrite === 0,
    ],
    [
      'Gyral docs median first write <= request 10',
      String(docs.firstWriteRequest.median ?? 'none'),
      docs.firstWriteRequest.missing === 0 &&
        docs.firstWriteRequest.median !== null &&
        docs.firstWriteRequest.median <= 10,
    ],
    [
      'Gyral assisted passes >= 8/9',
      `${assisted.passed}/${assisted.attempted}`,
      assisted.passed >= 8,
    ],
    [
      'Gyral assisted: scaffold_component or check_snippet in >= half the runs',
      `${assisted.runsUsingScaffoldOrCheckSnippet}/${assisted.attempted}`,
      assisted.attempted > 0 && assisted.runsUsingScaffoldOrCheckSnippet * 2 >= assisted.attempted,
    ],
    [
      'Gyral repeat reads <= 10% of doc calls',
      docCalls
        ? `${repeats}/${docCalls} (${Math.round((repeats / docCalls) * 100)}%)`
        : 'no doc calls',
      docCalls > 0 && repeats / docCalls <= 0.1,
    ],
  ];
  return rows.map(([criterion, observed, met]) => ({ criterion, observed, met }));
}

export function report(output, plan) {
  const results = plan.runs
    .filter((run) => existsSync(join(output, run.id, 'result.json')))
    .map((run) => JSON.parse(readFileSync(join(output, run.id, 'result.json'))));
  const passed = (result) => result.passed && !result.infrastructure;
  const cells = CONDITIONS.map((condition) => ({
    condition,
    tasks: Object.fromEntries(
      TASKS.map((task) => {
        const trials = results.filter(
          (result) => result.condition === condition && result.task === task,
        );
        return [task, { passed: trials.filter(passed).length, attempted: trials.length }];
      }),
    ),
  }));
  const known = results.filter((result) => result.usage.totalTokens !== null);
  const invalidated = plan.invalidated?.results ?? [];
  const invalidatedTokens = invalidated
    .filter((result) => result.usage.totalTokens !== null)
    .reduce((sum, result) => sum + result.usage.totalTokens, 0);
  const priorNotice = invalidated.length
    ? `${invalidated.length} invalidated initial attempts are retained separately; ${results.length + invalidated.length} total completed attempts across both harness revisions. Their reported usage totals ${invalidatedTokens} tokens. See the initial evidence index.`
    : '';
  const metrics = Object.fromEntries(
    CONDITIONS.map((condition) => [
      condition,
      conditionMetrics(results.filter((result) => result.condition === condition)),
    ]),
  );
  const checks = criteria(metrics);
  const summary = {
    protocol: plan.protocol ?? 'v1',
    mock: Boolean(plan.mock),
    attempted: results.length,
    planned: plan.runs.length,
    unstarted: plan.runs.length - results.length,
    passed: results.filter(passed).length,
    infrastructureFailures: results.filter((result) => result.infrastructure).length,
    cells,
    metrics,
    criteria: checks,
    knownTotalTokens: known.reduce((sum, result) => sum + result.usage.totalTokens, 0),
    runsWithCompleteUsage: known.length,
    costUsd: null,
    invalidatedAttempts: invalidated.length,
    totalAttemptsAcrossRevisions: results.length + invalidated.length,
    knownInvalidatedTokens: invalidatedTokens,
    knownAllAttemptTokens:
      invalidatedTokens + known.reduce((sum, result) => sum + result.usage.totalTokens, 0),
    distributions: Object.fromEntries(
      CONDITIONS.map((condition) => {
        const runs = results.filter((result) => result.condition === condition);
        return [
          condition,
          {
            promptTokens: distribution(runs.map((result) => result.usage.promptTokens)),
            completionTokens: distribution(runs.map((result) => result.usage.completionTokens)),
            totalTokens: distribution(runs.map((result) => result.usage.totalTokens)),
            tools: distribution(runs.map((result) => result.toolCalls)),
            repairs: distribution(runs.map((result) => result.repairAttempts)),
            elapsedMs: distribution(runs.map((result) => result.agentElapsedMs)),
          },
        ];
      }),
    ),
    limitations:
      'Three trials per cell; exploratory pilot, no general framework ranking. Provider model alias cannot prove immutable weights. Every framework gets the same documentation shape (index plus per-page Markdown), but its own official content, which differs in size and coverage. No verified billed dollar cost. Setup/probe usage excluded from measured-run totals.',
  };
  save(join(output, 'summary.json'), summary);
  writeFileSync(
    join(output, 'initial-attempts.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Initial pilot attempts</title><main><h1>Initial pilot attempts</h1><p>${escape(priorNotice)}</p><p>${escape(plan.invalidated?.reason ?? 'No earlier attempts.')}</p><p>${existsSync(join(output, 'invalidated/report.html')) ? '<a href="invalidated/report.html">Original evidence and outcomes</a> · ' : ''}<a href="report.html">Revised pilot report</a></p></main></html>`,
  );
  const banner = plan.mock
    ? '> MOCK harness validation: a scripted agent, no model requests. Not a measured run; never pool with measured results.\n\n'
    : '';
  const processRows = CONDITIONS.map((condition) => {
    const entry = metrics[condition];
    return `| ${condition} | ${entry.passed}/${entry.attempted} | ${entry.runsWithoutSourceWrite} | ${entry.firstWriteRequest.median ?? '—'} | ${entry.firstCheckRequest.median ?? '—'} | ${entry.repeatReads}/${entry.docCalls} | ${entry.checkpointRuns} | ${entry.runsUsingScaffoldOrCheckSnippet} | ${summary.distributions[condition].totalTokens.median ?? '—'} |`;
  });
  const criteriaRows = checks.map(
    (entry) => `| ${entry.criterion} | ${entry.observed} | ${entry.met ? 'Met' : 'Not met'} |`,
  );
  const rows = cells.map(
    (cell) =>
      `| ${cell.condition} | ${TASKS.map((task) => `${cell.tasks[task].passed}/${cell.tasks[task].attempted}`).join(' | ')} |`,
  );
  writeFileSync(
    join(output, 'report.md'),
    `# Agent benchmark pilot (protocol ${summary.protocol})\n\n${banner}${summary.attempted}/${summary.planned} runs completed; ${summary.passed} passed; ${summary.infrastructureFailures} infrastructure failures.\n\n${priorNotice}\n\n[Initial attempts](initial-attempts.html)\n\nModel: ${plan.model}; endpoint: ${plan.endpoint}. Measured provider tokens with complete counters: ${summary.knownTotalTokens} across ${known.length} runs. Dollar cost unavailable; monetary spend explicitly unlimited.\n\n| Condition | Feature | Bug | Form |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Process metrics\n\n| Condition | Passed | Runs without a write | Median first write | Median first check | Repeat reads / doc calls | Checkpoint runs | Runs using scaffold/check_snippet | Median tokens |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${processRows.join('\n')}\n\n## Success criteria (gyral-7se.31)\n\n| Criterion | Observed | Result |\n| --- | --- | --- |\n${criteriaRows.join('\n')}\n\n${summary.limitations}\n\n[Evidence index](report.html) · [Frozen protocol and ordering](plan.json) · [Summary JSON](summary.json)\n`,
  );
  const table = results
    .map(
      (result) =>
        `<tr><th scope="row"><a href="${result.id}/result.json">${escape(result.id)}</a></th><td>${passed(result) ? 'Pass' : result.infrastructure ? 'Infrastructure failure' : 'Fail'}</td><td>${escape(result.reason)}</td><td>${result.usage.totalTokens ?? 'Unavailable'}</td><td>${result.toolCalls}</td><td>${result.firstWriteRequest ?? '—'}</td><td>${result.firstCheckRequest ?? '—'}</td><td>${result.repeatReads ?? 0}/${result.docCalls ?? 0}</td><td>${result.checkpointAfterRequest ?? '—'}</td><td>${result.repairAttempts}</td><td>${Math.round(result.agentElapsedMs / 1000)}</td><td><a href="${result.id}/changes.patch">Patch</a> <a href="${result.id}/transcript.json">Transcript</a> <a href="${result.id}/final/grade.json">Checks</a> ${existsSync(join(output, result.id, 'final/1.png')) ? `<a href="${result.id}/final/1.png">Screenshot</a>` : 'No browser screenshot'}</td></tr>`,
    )
    .join('\n');
  const aggregate = cells
    .map(
      (cell) =>
        `<tr><th scope="row">${cell.condition}</th>${TASKS.map((task) => `<td>${cell.tasks[task].passed}/${cell.tasks[task].attempted}</td>`).join('')}</tr>`,
    )
    .join('');
  writeFileSync(
    join(output, 'report.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gyral agent pilot evidence</title></head><body><main><h1>Agent benchmark pilot</h1>${plan.mock ? '<p><strong>MOCK harness validation: scripted agent, no model requests. Not a measured run.</strong></p>' : ''}<p>${summary.attempted}/${summary.planned} runs completed; ${summary.passed} passed; ${summary.infrastructureFailures} infrastructure failures.</p><p>${escape(priorNotice)} <a href="initial-attempts.html">Initial evidence index</a></p><p>Model ${escape(plan.model)} through ${escape(plan.endpoint)}. Same per-run limits; no monetary cap by owner authorization.</p><p>${escape(summary.limitations)}</p><p><a href="plan.json">Frozen protocol</a> · <a href="summary.json">Summary JSON</a> · <a href="report.md">Markdown report</a></p><table><caption>Passes by condition and task</caption><thead><tr><th>Condition</th>${TASKS.map((task) => `<th>${task}</th>`).join('')}</tr></thead><tbody>${aggregate}</tbody></table><table><caption>Success criteria (gyral-7se.31)</caption><thead><tr><th>Criterion</th><th>Observed</th><th>Result</th></tr></thead><tbody>${checks.map((entry) => `<tr><th scope="row">${escape(entry.criterion)}</th><td>${escape(entry.observed)}</td><td>${entry.met ? 'Met' : 'Not met'}</td></tr>`).join('')}</tbody></table><table><caption>All measured runs and raw evidence</caption><thead><tr><th>Run</th><th>Outcome</th><th>Stop</th><th>Tokens</th><th>Tools</th><th>First write</th><th>First check</th><th>Repeat reads</th><th>Checkpoint</th><th>Repairs</th><th>Seconds</th><th>Evidence</th></tr></thead><tbody>${table}</tbody></table></main></body></html>`,
  );
  return summary;
}

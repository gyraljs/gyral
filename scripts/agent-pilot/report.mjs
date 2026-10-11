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
  const summary = {
    attempted: results.length,
    planned: plan.runs.length,
    unstarted: plan.runs.length - results.length,
    passed: results.filter(passed).length,
    infrastructureFailures: results.filter((result) => result.infrastructure).length,
    cells,
    knownTotalTokens: known.reduce((sum, result) => sum + result.usage.totalTokens, 0),
    runsWithCompleteUsage: known.length,
    costUsd: null,
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
      'Three trials per cell; exploratory pilot, no general framework ranking. Provider model alias cannot prove immutable weights. Documentation availability differs by framework. No verified billed dollar cost. Setup/probe usage excluded from measured-run totals.',
  };
  save(join(output, 'summary.json'), summary);
  const rows = cells.map(
    (cell) =>
      `| ${cell.condition} | ${TASKS.map((task) => `${cell.tasks[task].passed}/${cell.tasks[task].attempted}`).join(' | ')} |`,
  );
  writeFileSync(
    join(output, 'report.md'),
    `# Agent benchmark pilot\n\n${summary.attempted}/${summary.planned} runs completed; ${summary.passed} passed; ${summary.infrastructureFailures} infrastructure failures.\n\nModel: ${plan.model}; endpoint: ${plan.endpoint}. Measured provider tokens with complete counters: ${summary.knownTotalTokens} across ${known.length} runs. Dollar cost unavailable; monetary spend explicitly unlimited.\n\n| Condition | Feature | Bug | Form |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n${summary.limitations}\n\n[Evidence index](report.html) · [Frozen protocol and ordering](plan.json) · [Summary JSON](summary.json)\n`,
  );
  const table = results
    .map(
      (result) =>
        `<tr><th scope="row"><a href="${result.id}/result.json">${escape(result.id)}</a></th><td>${passed(result) ? 'Pass' : result.infrastructure ? 'Infrastructure failure' : 'Fail'}</td><td>${escape(result.reason)}</td><td>${result.usage.totalTokens ?? 'Unavailable'}</td><td>${result.toolCalls}</td><td>${result.repairAttempts}</td><td>${Math.round(result.agentElapsedMs / 1000)}</td><td><a href="${result.id}/changes.patch">Patch</a> <a href="${result.id}/transcript.json">Transcript</a> <a href="${result.id}/final/grade.json">Checks</a> <a href="${result.id}/final/1.png">Screenshot</a></td></tr>`,
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
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gyral agent pilot evidence</title></head><body><main><h1>Agent benchmark pilot</h1><p>${summary.attempted}/${summary.planned} runs completed; ${summary.passed} passed; ${summary.infrastructureFailures} infrastructure failures.</p><p>Model ${escape(plan.model)} through ${escape(plan.endpoint)}. Same per-run limits; no monetary cap by owner authorization.</p><p>${escape(summary.limitations)}</p><p><a href="plan.json">Frozen protocol</a> · <a href="summary.json">Summary JSON</a> · <a href="report.md">Markdown report</a></p><table><caption>Passes by condition and task</caption><thead><tr><th>Condition</th>${TASKS.map((task) => `<th>${task}</th>`).join('')}</tr></thead><tbody>${aggregate}</tbody></table><table><caption>All measured runs and raw evidence</caption><thead><tr><th>Run</th><th>Outcome</th><th>Stop</th><th>Tokens</th><th>Tools</th><th>Repairs</th><th>Seconds</th><th>Evidence</th></tr></thead><tbody>${table}</tbody></table></main></body></html>`,
  );
  return summary;
}

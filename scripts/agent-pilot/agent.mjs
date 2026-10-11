import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hashes, save, sha256, workspace } from './corpus.mjs';
import { prompt } from './prompts.mjs';
import { createTools } from './tools.mjs';
import { connectMcp } from './mcp.mjs';
import { complete, LIMITS, requestBody, usageSummary } from './provider.mjs';
import { grade } from './grader.mjs';

export async function trial(corpus, output, run, config, adapters = {}) {
  const completion = adapters.complete ?? complete;
  const grading = adapters.grade ?? grade;
  mkdirSync(output);
  const app = join(output, 'app');
  workspace(corpus, app, run.framework, run.task);
  const before = join(output, 'initial');
  workspace(corpus, before, run.framework, run.task);
  const initialHashes = hashes(app);
  const assisted = run.condition === 'gyral-assisted';
  const skill = assisted ? readFileSync(join(corpus, 'docs/skill/SKILL.md'), 'utf8') : '';
  const messages = [
    {
      role: 'system',
      content:
        'You are a coding agent. Use only the supplied tools and documentation. Implement the user contract in the isolated application workspace.',
    },
    {
      role: 'user',
      content:
        prompt(run.framework, run.task, assisted) +
        (skill ? `\n\nReleased Gyral skill:\n${skill}` : ''),
    },
  ];
  const responses = [];
  const calls = [];
  let mcp;
  let tools;
  let reason = 'request_limit';
  let error;
  const start = Date.now();
  const deadline = start + LIMITS.wallMs;
  const checkpoint = () => save(join(output, 'transcript.json'), { messages, responses, calls });
  try {
    if (assisted) mcp = await connectMcp(corpus, app);
    tools = createTools(corpus, app, run, output, mcp, grading);
    save(join(output, 'context.json'), {
      ...run,
      model: config.model,
      endpoint: config.baseUrl,
      limits: LIMITS,
      monetaryCap: null,
      ownerAuthorizedUnlimited: true,
      initialHashes,
      promptHash: sha256(JSON.stringify(messages)),
      tools: tools.definitions,
    });
    for (let request = 0; request < LIMITS.requests; request++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reason = 'wall_limit';
        break;
      }
      if (calls.length >= LIMITS.tools) {
        reason = 'tool_limit';
        break;
      }
      const usage = usageSummary(responses);
      if (usage.completionTokens === null) {
        reason = 'usage_unavailable';
        break;
      }
      if (
        usage.completionTokens !== null &&
        usage.completionTokens + LIMITS.maxOutputTokens > LIMITS.completionTokens
      ) {
        reason = 'completion_token_limit';
        break;
      }
      const body = requestBody(config.model, messages, tools.definitions);
      save(join(output, `request-${request + 1}.json`), body);
      const response = await completion(config, body, remaining);
      responses.push(response);
      save(join(output, `response-${request + 1}.json`), response);
      if (!response.ok) {
        reason = 'provider_failure';
        checkpoint();
        break;
      }
      const message = response.data.choices[0].message;
      messages.push(message);
      if (!message.tool_calls?.length) {
        reason = 'agent_finished';
        checkpoint();
        break;
      }
      for (const call of message.tool_calls) {
        if (Date.now() >= deadline || calls.length >= LIMITS.tools) {
          reason = Date.now() >= deadline ? 'wall_limit' : 'tool_limit';
          break;
        }
        let result;
        const callStart = Date.now();
        try {
          const args = JSON.parse(call.function.arguments);
          result = await tools.execute(call.function.name, args, deadline - Date.now());
        } catch (caught) {
          result = { error: String(caught) };
        }
        const content = JSON.stringify(result);
        if (content.includes(config.apiKey))
          throw new Error('Credential in tool output; evidence suppressed');
        calls.push({ ...call, result, elapsedMs: Date.now() - callStart });
        messages.push({ role: 'tool', tool_call_id: call.id, content });
        checkpoint();
      }
      if (['wall_limit', 'tool_limit'].includes(reason)) break;
    }
  } catch (caught) {
    error = String(caught);
    reason = error.includes('context_byte_limit') ? 'context_byte_limit' : 'infrastructure_failure';
  } finally {
    await mcp?.close();
  }
  const agentElapsedMs = Date.now() - start;
  const final = await grading(corpus, app, run.framework, run.task, join(output, 'final'));
  const finalSource = JSON.stringify(
    Object.fromEntries(Object.entries(hashes(app)).filter(([name]) => name.startsWith('src/'))),
  );
  const finalRepair =
    tools?.checks.some((check) => !check.passed) && tools.checks.at(-1)?.hash !== finalSource
      ? 1
      : 0;
  let patch;
  try {
    patch = execFileSync(
      'git',
      ['diff', '--no-index', '--', join(before, 'src'), join(app, 'src')],
      { encoding: 'utf8' },
    );
  } catch (caught) {
    if (caught.status !== 1) throw caught;
    patch = caught.stdout;
  }
  writeFileSync(join(output, 'changes.patch'), patch);
  const result = {
    ...run,
    model: config.model,
    endpoint: config.baseUrl,
    reason,
    error,
    passed: final.passed,
    infrastructure:
      final.infrastructure ||
      ['provider_failure', 'infrastructure_failure', 'usage_unavailable'].includes(reason),
    agentElapsedMs,
    totalElapsedMs: Date.now() - start,
    toolCalls: calls.length,
    repairAttempts: (tools?.repairs() ?? 0) + finalRepair,
    checks: tools?.checks ?? [],
    accesses: tools?.accesses ?? [],
    usage: usageSummary(responses),
    initialHashes,
    finalHashes: hashes(app),
  };
  checkpoint();
  save(join(output, 'result.json'), result);
  console.log(
    `${run.id}: ${result.passed ? 'PASS' : 'FAIL'} (${reason}, ${responses.length} requests)`,
  );
  return result;
}

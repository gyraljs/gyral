import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hashes, save, sha256, workspace } from './corpus.mjs';
import { prompt } from './prompts.mjs';
import { createTools, DOC_TOOLS } from './tools.mjs';
import { connectMcp } from './mcp.mjs';
import { budgetLine, checkpointMessage, compact, POLICY, summarize } from './context.mjs';
import { complete, contextGuard, LIMITS, requestBody, usageSummary } from './provider.mjs';
import { grade } from './grader.mjs';

export const SYSTEM_PROMPT =
  'You are a coding agent. Use only the supplied tools and documentation. Implement the user contract in the isolated application workspace.';

export async function trial(corpus, output, run, config, adapters = {}) {
  const completion = adapters.complete ?? complete;
  const grading = adapters.grade ?? grade;
  const connect = adapters.connectMcp ?? connectMcp;
  mkdirSync(output);
  const app = join(output, 'app');
  workspace(corpus, app, run.framework, run.task);
  const before = join(output, 'initial');
  workspace(corpus, before, run.framework, run.task);
  const initialHashes = hashes(app);
  const assisted = run.condition === 'gyral-assisted';
  const skill = assisted ? readFileSync(join(corpus, 'docs/skill/SKILL.md'), 'utf8') : '';
  const messages = [];
  const responses = [];
  const calls = [];
  // tool_call_id -> { name, request, budget, summary } for compaction stubs.
  const meta = new Map();
  let previousContext;
  let mcp;
  let tools;
  let reason = 'request_limit';
  let error;
  let checkpointAfterRequest = null;
  let stubbed = 0;
  const start = Date.now();
  const deadline = start + LIMITS.wallMs;
  const checkpoint = () => save(join(output, 'transcript.json'), { messages, responses, calls });
  try {
    if (assisted) {
      mkdirSync(join(output, 'mcp-generated'));
      mcp = await connect(corpus, app, join(output, 'mcp-generated'));
    }
    messages.push(
      {
        role: 'system',
        content:
          SYSTEM_PROMPT +
          (mcp?.instructions
            ? `\n\nInstructions from the connected Gyral MCP server:\n${mcp.instructions}`
            : ''),
      },
      {
        role: 'user',
        content:
          prompt(run.framework, run.task, assisted, LIMITS.requests) +
          (skill ? `\n\nReleased Gyral skill:\n${skill}` : ''),
      },
    );
    tools = createTools(corpus, app, run, output, mcp, grading);
    save(join(output, 'context.json'), {
      ...run,
      protocol: 'v3',
      model: config.model,
      endpoint: config.baseUrl,
      limits: LIMITS,
      policy: POLICY,
      monetaryCap: null,
      ownerAuthorizedUnlimited: true,
      initialHashes,
      promptHash: sha256(JSON.stringify(messages)),
      tools: tools.definitions,
      mcp: mcp
        ? { instructions: mcp.instructions, prompts: mcp.prompts, resources: mcp.resources }
        : null,
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
      const sent = compact(messages, meta);
      stubbed = sent.stubbed;
      const body = requestBody(config.model, sent.messages, tools.definitions, previousContext);
      save(join(output, `context-guard-${request + 1}.json`), {
        ...contextGuard(sent.messages, tools.definitions, previousContext),
        compactedToolResults: sent.stubbed,
      });
      save(join(output, `request-${request + 1}.json`), body);
      let response;
      try {
        response = await completion(config, body, remaining);
      } catch (caught) {
        response = {
          ok: false,
          status: null,
          data: {
            error: String(caught),
            usageUnavailable: 'Request dispatched but no usable response returned.',
          },
        };
      }
      responses.push(response);
      save(join(output, `response-${request + 1}.json`), response);
      if (!response.ok) {
        reason = 'provider_failure';
        checkpoint();
        break;
      }
      const message = response.data.choices[0].message;
      previousContext = {
        messageCount: messages.length,
        promptTokens: response.data.usage?.prompt_tokens,
      };
      messages.push(message);
      if (!message.tool_calls?.length) {
        reason = 'agent_finished';
        checkpoint();
        break;
      }
      const number = request + 1;
      const budget = budgetLine(number, LIMITS.requests);
      tools.setRequest(number);
      for (const call of message.tool_calls) {
        if (Date.now() >= deadline || calls.length >= LIMITS.tools) {
          reason = Date.now() >= deadline ? 'wall_limit' : 'tool_limit';
          break;
        }
        let result;
        let args;
        const callStart = Date.now();
        try {
          args = JSON.parse(call.function.arguments);
          result = await tools.execute(call.function.name, args, deadline - Date.now());
        } catch (caught) {
          result = { error: String(caught) };
        }
        const content = JSON.stringify({ budget, result });
        if (content.includes(config.apiKey))
          throw new Error('Credential in tool output; evidence suppressed');
        meta.set(call.id, {
          name: call.function.name,
          request: number,
          budget,
          summary: summarize(call.function.name, args, result),
        });
        calls.push({ ...call, request: number, result, elapsedMs: Date.now() - callStart });
        messages.push({ role: 'tool', tool_call_id: call.id, content });
        checkpoint();
      }
      if (['wall_limit', 'tool_limit'].includes(reason)) break;
      if (
        number === POLICY.checkpointAfterRequest &&
        number < LIMITS.requests &&
        !tools.accesses.some((entry) => entry.name === 'write_file')
      ) {
        messages.push({ role: 'user', content: checkpointMessage(number, LIMITS.requests) });
        checkpointAfterRequest = number;
        checkpoint();
      }
    }
  } catch (caught) {
    error = String(caught);
    reason = error.includes('context_limit')
      ? 'context_limit'
      : error.includes('usage_unavailable')
        ? 'usage_unavailable'
        : 'infrastructure_failure';
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
    ...metrics(calls, tools),
    checkpointAfterRequest,
    compactedToolResultsAtLastRequest: stubbed,
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

/** Protocol v3 process metrics: first write/check, tool use, documentation calls and repeats. */
export function metrics(calls, tools) {
  const accesses = tools?.accesses ?? [];
  const toolUse = {};
  for (const call of calls) toolUse[call.function.name] = (toolUse[call.function.name] ?? 0) + 1;
  const docCalls = calls.filter((call) => DOC_TOOLS.has(call.function.name)).length;
  const repeatReads = accesses.filter((entry) => entry.repeat).length;
  return {
    firstWriteRequest: accesses.find((entry) => entry.name === 'write_file')?.request ?? null,
    firstCheckRequest: tools?.checks[0]?.request ?? null,
    sourceWrites: accesses.filter((entry) => entry.name === 'write_file').length,
    toolUse,
    docCalls,
    repeatReads,
    usefulMcpTools: (toolUse.mcp_scaffold_component ?? 0) + (toolUse.mcp_check_snippet ?? 0),
  };
}

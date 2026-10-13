// External agents (protocol v3): an agent this harness does not drive, such as a Claude Code
// subagent, reaches the same tools, request budget, checkpoint and grader through a local bridge.
// One `call` invocation is one model request and may carry several tool calls, as one provider
// response can. The bridge records the same evidence as trial(); what it cannot see (the agent's
// own context handling and token usage) is marked unavailable in each result.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { hashes, save, sha256, workspace } from './corpus.mjs';
import { metrics, SYSTEM_PROMPT } from './agent.mjs';
import { budgetLine, checkpointMessage, POLICY } from './context.mjs';
import { grade } from './grader.mjs';
import { ordering, prompt } from './prompts.mjs';
import { LIMITS } from './provider.mjs';
import { report } from './report.mjs';
import { verifyFrozen } from './run.mjs';
import { BASE_TOOLS, createTools } from './tools.mjs';

export const ENDPOINT = 'external-agent-bridge';

/** How an external agent calls the tools; appended to the protocol prompt. */
export const bridgeUsage = (command) =>
  `\n\nThe tools are reached with one shell command, ${command}. Each invocation is one model request and returns JSON with the budget line and each tool's result:\n` +
  `- ${command} <tool> ['<JSON arguments>']   e.g. ${command} get_doc '{"page":"docs/recipes"}'\n` +
  `- ${command} write <path>   with the file content on stdin, e.g. ${command} write src/main.ts <<'EOF' ... EOF\n` +
  `- ${command} batch   with a JSON array of {"name","arguments"} calls on stdin, to make several calls in one request\n` +
  `Tools: ${BASE_TOOLS.map((tool) => tool.function.name).join(', ')}.`;

export async function serveExternal(corpus, output, { model, port, only }) {
  assert.ok(model, '--model names the external agent');
  const frozen = verifyFrozen(corpus);
  const file = join(output, 'plan.json');
  let plan;
  if (existsSync(file)) {
    plan = JSON.parse(readFileSync(file));
    assert.equal(plan.corpusHash, sha256(JSON.stringify(frozen)));
    assert.equal(plan.model, model);
    assert.deepEqual(plan.limits, LIMITS);
    assert.deepEqual(plan.only ?? null, only ?? null, 'Resume with the same --only');
  } else {
    mkdirSync(output);
    plan = {
      version: 3,
      protocol: 'v3',
      external: true,
      notice:
        'External agent through the local bridge: same prompt contract, tools, budget, checkpoint and grader; the agent manages its own context, and its token usage is not observed.',
      createdAt: new Date().toISOString(),
      model,
      endpoint: ENDPOINT,
      limits: LIMITS,
      policy: POLICY,
      corpusHash: sha256(JSON.stringify(frozen)),
      frozen,
      orderingSeed: 20261011,
      ...(only ? { only } : {}),
      runs: ordering().filter((run) => !only || only.includes(run.condition)),
    };
    save(file, plan);
    cpSync(join(corpus, 'docs'), join(output, 'frozen-docs'), { recursive: true });
  }
  const trials = new Map();

  const start = ({ id, command }) => {
    const run = plan.runs.find((entry) => entry.id === id);
    if (!run) throw new Error(`Unknown run ${id}`);
    if (run.condition === 'gyral-assisted') throw new Error('The bridge has no MCP tools');
    const destination = join(output, id);
    if (existsSync(destination)) throw new Error(`${id} already started; evidence retained`);
    mkdirSync(destination);
    const app = join(destination, 'app');
    workspace(corpus, app, run.framework, run.task);
    workspace(corpus, join(destination, 'initial'), run.framework, run.task);
    const initialHashes = hashes(app);
    const tools = createTools(corpus, app, run, destination, undefined, grade);
    const text = `${SYSTEM_PROMPT}\n\n${prompt(run.framework, run.task, false, LIMITS.requests)}${bridgeUsage(command)}`;
    const now = Date.now();
    const state = {
      run,
      destination,
      app,
      tools,
      initialHashes,
      calls: [],
      requests: [],
      request: 0,
      start: now,
      deadline: now + LIMITS.wallMs,
      checkpointAfterRequest: null,
      written: JSON.stringify(tools.sourceHashes()),
      reason: null,
    };
    trials.set(id, state);
    save(join(destination, 'context.json'), {
      ...run,
      protocol: 'v3',
      model,
      endpoint: ENDPOINT,
      limits: LIMITS,
      policy: POLICY,
      initialHashes,
      promptHash: sha256(text),
      prompt: text,
      tools: tools.definitions,
    });
    return { prompt: text };
  };

  const request = async ({ id, calls }) => {
    const state = trials.get(id);
    if (!state || state.finished) throw new Error(`${id} is not running`);
    if (Date.now() >= state.deadline) state.reason ??= 'wall_limit';
    else if (state.request >= LIMITS.requests) state.reason ??= 'request_limit';
    else if (state.calls.length >= LIMITS.tools) state.reason ??= 'tool_limit';
    if (state.reason)
      return { stopped: state.reason, message: 'No requests remain. Stop and report.' };
    // Unparseable input still costs the request, as malformed tool arguments do in trial().
    let list = calls;
    if (typeof calls === 'string') {
      try {
        list = JSON.parse(calls);
      } catch {
        list = [{ name: 'batch', raw: calls }];
      }
    }
    if (!Array.isArray(list) || list.length === 0) list = [{ name: 'batch', raw: String(calls) }];
    const number = ++state.request;
    const budget = budgetLine(number, LIMITS.requests);
    state.tools.setRequest(number);
    const results = [];
    for (const call of list) {
      if (Date.now() >= state.deadline || state.calls.length >= LIMITS.tools) {
        state.reason = Date.now() >= state.deadline ? 'wall_limit' : 'tool_limit';
        break;
      }
      const callStart = Date.now();
      let result;
      try {
        const args = typeof call?.raw === 'string' ? JSON.parse(call.raw) : call?.arguments;
        result = await state.tools.execute(call?.name, args ?? {}, state.deadline - Date.now());
      } catch (caught) {
        result = { error: String(caught) };
      }
      if (call?.name === 'write_file' && !result?.error)
        state.written = JSON.stringify(state.tools.sourceHashes());
      state.calls.push({
        id: `call-${state.calls.length + 1}`,
        type: 'function',
        function: {
          name: String(call?.name),
          arguments: call?.raw ?? JSON.stringify(call?.arguments ?? {}),
        },
        request: number,
        result,
        elapsedMs: Date.now() - callStart,
      });
      results.push({ name: call?.name, result });
    }
    const response = { budget, results };
    if (
      number === POLICY.checkpointAfterRequest &&
      number < LIMITS.requests &&
      !state.tools.accesses.some((entry) => entry.name === 'write_file')
    ) {
      response.checkpoint = checkpointMessage(number, LIMITS.requests);
      state.checkpointAfterRequest = number;
    }
    state.requests.push({ request: number, at: new Date().toISOString(), response });
    save(join(state.destination, 'transcript.json'), {
      requests: state.requests,
      calls: state.calls,
    });
    return response;
  };

  const finish = async ({ id, usage }) => {
    const state = trials.get(id);
    if (!state || state.finished) throw new Error(`${id} is not running`);
    state.finished = true;
    const { run, destination, app, tools } = state;
    const reason =
      state.reason ??
      (state.request >= LIMITS.requests
        ? 'request_limit'
        : Date.now() >= state.deadline
          ? 'wall_limit'
          : 'agent_finished');
    const agentElapsedMs = Date.now() - state.start;
    const finalSource = JSON.stringify(tools.sourceHashes());
    // Source changed outside write_file: the run did not follow the protocol.
    const outOfBand = finalSource !== state.written;
    const final = await grade(corpus, app, run.framework, run.task, join(destination, 'final'));
    const finalRepair =
      tools.checks.some((check) => !check.passed) && tools.checks.at(-1)?.hash !== finalSource
        ? 1
        : 0;
    let patch;
    try {
      patch = execFileSync(
        'git',
        ['diff', '--no-index', '--', join(destination, 'initial', 'src'), join(app, 'src')],
        { encoding: 'utf8' },
      );
    } catch (caught) {
      if (caught.status !== 1) throw caught;
      patch = caught.stdout;
    }
    writeFileSync(join(destination, 'changes.patch'), patch);
    const result = {
      ...run,
      model,
      endpoint: ENDPOINT,
      reason,
      outOfBand,
      passed: final.passed && !outOfBand,
      infrastructure: Boolean(final.infrastructure),
      agentElapsedMs,
      totalElapsedMs: Date.now() - state.start,
      toolCalls: state.calls.length,
      repairAttempts: tools.repairs() + finalRepair,
      ...metrics(state.calls, tools),
      checkpointAfterRequest: state.checkpointAfterRequest,
      checks: tools.checks,
      accesses: tools.accesses,
      usage: {
        requests: state.request,
        promptTokens: null,
        completionTokens: null,
        totalTokens: usage?.totalTokens ?? null,
        costUsd: null,
        costUnavailable: 'External agent; usage as reported by its host, when given.',
      },
      initialHashes: state.initialHashes,
      finalHashes: hashes(app),
    };
    save(join(destination, 'result.json'), result);
    console.log(
      `${run.id}: ${result.passed ? 'PASS' : 'FAIL'} (${reason}, ${state.request} requests)`,
    );
    report(output, plan);
    return { id, passed: result.passed, reason, requests: state.request, outOfBand };
  };

  const routes = { start, request, finish };
  const server = createServer(async (incoming, outgoing) => {
    let body = '';
    for await (const chunk of incoming) body += chunk;
    let status = 200;
    let answer;
    try {
      const route = routes[incoming.url.slice(1)];
      if (incoming.method !== 'POST' || !route) throw new Error('Unknown route');
      answer = await route(JSON.parse(body));
    } catch (caught) {
      status = 400;
      answer = { error: String(caught) };
    }
    outgoing.writeHead(status, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify(answer));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(`bridge listening on 127.0.0.1:${port} for ${plan.runs.length} runs`);
  await new Promise(() => {});
}

const readStdin = async () => {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
};

/** The agent-facing command: one invocation, one request. `start` and `finish` are for the operator. */
export async function callExternal(port, trial, args) {
  assert.ok(trial, '--trial is required');
  const [verb, ...rest] = args;
  let route = 'request';
  let payload;
  if (verb === 'start') [route, payload] = ['start', { id: trial, command: rest[0] ?? 'pilot' }];
  else if (verb === 'finish')
    [route, payload] = [
      'finish',
      { id: trial, usage: rest[0] ? { totalTokens: Number(rest[0]) } : undefined },
    ];
  else if (verb === 'write')
    payload = {
      id: trial,
      calls: [{ name: 'write_file', arguments: { path: rest[0], content: await readStdin() } }],
    };
  else if (verb === 'batch') payload = { id: trial, calls: await readStdin() };
  else if (verb) payload = { id: trial, calls: [{ name: verb, raw: rest[0] ?? '{}' }] };
  else throw new Error('Usage: call <tool> [JSON] | write <path> | batch | start | finish');
  const response = await fetch(`http://127.0.0.1:${port}/${route}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const answer = await response.json();
  console.log(
    route === 'start' ? (answer.prompt ?? JSON.stringify(answer)) : JSON.stringify(answer, null, 1),
  );
  if (!response.ok) process.exitCode = 1;
}

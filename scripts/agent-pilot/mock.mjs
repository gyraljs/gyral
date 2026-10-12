// A scripted stand-in for the model, for validating the whole pipeline without provider
// requests. It drives the real tools, MCP bridge, grader, budget, checkpoint, compaction and
// report. Mock results are harness validation only and are never measured trials.
import { fixtureSource, targetFile } from './corpus.mjs';

export const MOCK_CONFIG = Object.freeze({
  model: 'mock-agent',
  baseUrl: 'mock://scripted',
});

const QUERIES = {
  feature: 'keyed list filter',
  bug: 'list item identity key',
  form: 'form validation errors',
};

const lastResult = (messages) => {
  const tool = messages.findLast((message) => message.role === 'tool');
  try {
    return JSON.parse(tool?.content ?? 'null')?.result;
  } catch {
    return undefined;
  }
};

/**
 * The script, by trial: 1 writes the starter unchanged, checks (fails), then repairs;
 * 2 writes the reference after a short look at the docs; 3 keeps reading until the
 * half-budget checkpoint arrives, then writes. Every trial repeats one read on purpose.
 */
export function mockAgent(run) {
  const assisted = run.condition === 'gyral-assisted';
  const file = targetFile(run.framework);
  const plan = [
    () => [
      ['list_files', {}],
      ['list_docs', {}],
    ],
    () => [['search_docs', { query: QUERIES[run.task], limit: 3 }]],
    (messages) => {
      const top = lastResult(messages)?.results?.[0];
      return [['get_doc', top ? { page: top.page, section: top.section } : { page: 'missing' }]];
    },
    (messages) => {
      const read = messages.findLast(
        (message) =>
          message.role === 'assistant' && message.tool_calls?.[0]?.function.name === 'get_doc',
      );
      return [['get_doc', JSON.parse(read.tool_calls[0].function.arguments)]];
    },
  ];
  if (assisted)
    plan.push(
      () => [
        [
          'mcp_get_prompt',
          { name: 'build-gyral-component', arguments: { tag: 'pilot-app', description: run.task } },
        ],
      ],
      () => [['mcp_read_resource', { uri: 'gyral://skill/references/view.md' }]],
      () => [['mcp_search_docs', { query: QUERIES[run.task], limit: 2 }]],
    );
  const starter = fixtureSource(run.framework, run.task, false);
  const reference = fixtureSource(run.framework, run.task, true);
  const finish = [];
  if (run.trial === 1)
    finish.push(
      () => [['write_file', { path: file, content: starter }]],
      () => [['check', {}]],
    );
  finish.push(
    () => [['write_file', { path: file, content: reference }]],
    () => [['check', {}]],
  );
  let pageCursor = 0;
  const isCheckpoint = (message) =>
    message.role === 'user' && message.content.startsWith('Checkpoint:');
  return (messages) => {
    const assistant = (list) => list.filter((message) => message.role === 'assistant').length;
    const requests = assistant(messages);
    if (requests < plan.length) return plan[requests](messages);
    const checkpoint = messages.findIndex(isCheckpoint);
    if (run.trial === 3 && checkpoint < 0) {
      const listed = messages
        .map((message) => (message.role === 'tool' ? JSON.parse(message.content).result : null))
        .find((result) => Array.isArray(result?.pages));
      const page = listed?.pages[pageCursor++ % listed.pages.length]?.split(' | ')[0];
      return [['get_doc', { page: page ?? 'missing' }]];
    }
    const started = run.trial === 3 ? assistant(messages.slice(0, checkpoint)) : plan.length;
    const step = requests - started;
    return step < finish.length ? finish[step](messages) : null;
  };
}

/** A `complete(config, body)` replacement that answers with the mock agent's next calls. */
export function mockComplete(run) {
  const next = mockAgent(run);
  let id = 0;
  return async (config, body) => {
    const calls = next(body.messages);
    const promptTokens = Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 4);
    const message = calls
      ? {
          role: 'assistant',
          content: null,
          tool_calls: calls.map(([name, args]) => ({
            id: `mock-${++id}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          })),
        }
      : { role: 'assistant', content: 'Done: the final check passed.' };
    const completionTokens = Math.ceil(Buffer.byteLength(JSON.stringify(message)) / 4);
    return {
      ok: true,
      status: 200,
      data: {
        model: config.model,
        mock: true,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        choices: [{ message }],
      },
    };
  };
}

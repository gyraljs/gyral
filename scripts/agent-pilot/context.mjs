// Per-request context rules shared by every condition (protocol v3): the visible request
// budget (H3), one half-budget checkpoint (H3) and deterministic compaction of older tool
// output (H4). The full, uncompacted history stays in the transcript.
export const POLICY = Object.freeze({
  keepRecentToolResults: 4,
  compactAboveCharacters: 600,
  checkpointAfterRequest: 12,
  summaryCharacters: 240,
});

export const budgetLine = (request, total) =>
  `Model request ${request} of ${total} used; ${total - request} remaining.`;

export const checkpointMessage = (request, total) =>
  `Checkpoint: ${request} of ${total} model requests are used and no source file has been written yet. ${total - request} requests remain. Write your implementation under src/ with write_file, then run check; its results show what still fails.`;

const clip = (text, max = POLICY.summaryCharacters) => {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** A short, deterministic description of a tool result, kept when its output is compacted. */
export function summarize(name, args, result) {
  const value = result?.warning && result.result !== undefined ? result.result : result;
  if (result?.error && Object.keys(result).length === 1) return `Error: ${clip(result.error)}`;
  switch (name) {
    case 'list_files':
      return `Listed ${value?.files?.length ?? 0} application files.`;
    case 'read_file':
      return `Read ${args?.path} (${String(value ?? '').length} characters).`;
    case 'write_file':
      return `Wrote ${args?.path}.`;
    case 'list_docs':
      return `Listed ${value?.pages?.length ?? 0} documentation pages.`;
    case 'search_docs':
      return `Search "${clip(args?.query, 80)}" top results: ${clip(
        (value?.results ?? [])
          .slice(0, 5)
          .map((entry) => `${entry.page} › ${entry.section}`)
          .join('; ') || 'none',
      )}.`;
    case 'get_doc':
      return value?.error
        ? `Error: ${clip(value.error)}`
        : `Read ${value?.page}${value?.section ? ` › ${value.section}` : ''} (${value?.text?.length ?? 0} characters).`;
    case 'check': {
      const failed = (value?.cases ?? [])
        .filter((entry) => !entry.passed)
        .map((entry) => entry.name);
      return `Check ${value?.passed ? 'passed' : 'failed'} (type ${value?.type}, build ${value?.build}${
        failed.length ? `; failing: ${failed.join(', ')}` : ''
      }).`;
    }
    default: {
      const content = value?.content ?? value?.messages ?? value?.contents ?? value;
      const text = Array.isArray(content)
        ? content.map((entry) => entry.text ?? '').join(' ')
        : JSON.stringify(content ?? '');
      return `${name}: ${clip(text)}`;
    }
  }
}

/**
 * The messages sent to the model: identical to the history except that tool results older
 * than the most recent `keepRecentToolResults`, and longer than `compactAboveCharacters`, are
 * replaced by a stub carrying their budget line and summary. Message count never changes.
 */
export function compact(messages, meta, policy = POLICY) {
  const toolIndexes = messages
    .map((message, index) => (message.role === 'tool' ? index : -1))
    .filter((index) => index >= 0);
  const older = new Set(
    toolIndexes.slice(0, Math.max(0, toolIndexes.length - policy.keepRecentToolResults)),
  );
  let stubbed = 0;
  const compacted = messages.map((message, index) => {
    if (!older.has(index) || message.content.length <= policy.compactAboveCharacters)
      return message;
    const info = meta.get(message.tool_call_id);
    if (!info) return message;
    stubbed++;
    return {
      ...message,
      content: JSON.stringify({
        budget: info.budget,
        compacted: `Output of ${info.name} from request ${info.request} omitted to save context (${message.content.length} characters). ${info.summary} Call the tool again if you need the full output.`,
      }),
    };
  });
  return { messages: compacted, stubbed };
}

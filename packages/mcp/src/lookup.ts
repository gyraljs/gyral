// get_api's answer: the declaration as before, plus what to do with it (guidance.ts).
import { bareName, explainInternal, findApi, formatApi } from './api.js';
import { indexApi } from './api-index.js';
import { taskOf, typeNote, usageFor, type Task } from './guidance.js';
import type { ApiEntry, Corpus } from './types.js';

export interface Lookup {
  readonly body: string;
  readonly isError: boolean;
  /** The task the symbol suggests, for the nudge; undefined for "*" and misses. */
  readonly task: Task | undefined;
}

/** Declarations, then a usage module and next call (runtime) or a note (types). */
function answer(matches: readonly ApiEntry[], snippetChecks: boolean, lead = ''): Lookup {
  const [first] = matches;
  const declarations = matches.map(formatApi).join('\n\n');
  if (first === undefined) return { body: declarations, isError: false, task: undefined };
  const guidance =
    first.kind === 'type'
      ? typeNote(first.name, snippetChecks)
      : usageFor(first.name, snippetChecks);
  return {
    body: [lead, declarations, guidance].filter((part) => part !== '').join('\n\n'),
    isError: false,
    task: taskOf(first.name, first.kind),
  };
}

export function lookupApi(
  corpus: Corpus,
  symbol: string,
  pkg: string | undefined,
  snippetChecks: boolean,
): Lookup {
  if (symbol.trim() === '*') {
    const index = indexApi(corpus.api, pkg);
    return index === ''
      ? { body: `No exports for package "${pkg ?? ''}".`, isError: false, task: undefined }
      : { body: index, isError: false, task: undefined };
  }
  const { matches, suggestions } = findApi(corpus.api, symbol, pkg);
  if (matches.length > 0) return answer(matches, snippetChecks);
  // `StandardSchemaV1.Issue`, `prop.string`: the part before the dot.
  const head = symbol.trim().split('.')[0] ?? '';
  if (head !== symbol.trim() && head !== '') {
    const outer = findApi(corpus.api, head, pkg).matches;
    if (outer.length > 0)
      return answer(outer, snippetChecks, `\`${symbol.trim()}\` is a member of \`${head}\`:`);
  }
  const internal = explainInternal(corpus.internalTypes, symbol);
  if (internal !== undefined) {
    return {
      body: `${internal}\n\n${typeNote(bareName(symbol), snippetChecks)}`,
      isError: false,
      task: 'component',
    };
  }
  const hint =
    suggestions.length > 0
      ? ` Did you mean: ${suggestions.join(', ')}?`
      : ' Pass "*" for the exports by task.';
  return {
    body: `No public export named "${symbol}"${pkg === undefined ? '' : ` in ${pkg}`}.${hint} A name you saw in an example or a recipe but not here (State, Msg, Errors, Field) is that example's own declaration: copy it from the example.`,
    isError: true,
    task: undefined,
  };
}

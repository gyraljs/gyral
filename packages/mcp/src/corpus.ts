// Loads the corpus bundled at build time, optionally refreshing the docs from a live
// llms-full.txt (GYRAL_DOCS_URL) with a timeout and a silent fallback to the bundled copy.
import { readFile } from 'node:fs/promises';
import { parseLlmsFull } from './docs.js';
import type { Corpus } from './types.js';

/** dist/corpus.json, written next to the compiled server by scripts/build-corpus.mjs. */
export async function loadCorpus(
  file: URL = new URL('./corpus.json', import.meta.url),
): Promise<Corpus> {
  return JSON.parse(await readFile(file, 'utf8')) as Corpus;
}

/**
 * Replaces the docs with a fresh llms-full.txt from `url`. Returns the corpus unchanged (and
 * the reason) if the fetch fails, times out or parses to nothing.
 */
export async function refreshDocs(
  corpus: Corpus,
  url: string,
  timeoutMs = 3000,
): Promise<{ readonly corpus: Corpus; readonly note: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { corpus, note: `${url} answered ${String(response.status)}` };
    const docs = parseLlmsFull(await response.text());
    if (docs.length === 0) return { corpus, note: `${url} had no pages` };
    return { corpus: { ...corpus, docs }, note: `docs refreshed from ${url}` };
  } catch (error) {
    return { corpus, note: `${url} unavailable (${String(error)})` };
  }
}

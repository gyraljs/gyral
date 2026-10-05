import type { Corpus, DocPage } from '../src/types.js';

export function buildCorpus(parseLlmsFull: (text: string) => DocPage[]): Corpus;

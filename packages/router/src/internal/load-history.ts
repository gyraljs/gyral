// Loads the History API path (ADR 0003 tier 3) as its own chunk. A module of its own so tests
// can stand in for a chunk that fails to load.
import type { HistoryPath } from './history.js';

export const loadHistory = (): Promise<{
  historyPath: typeof import('./history.js').historyPath;
}> => import('./history.js');

export type { HistoryPath };

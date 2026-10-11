import { settled } from '@gyral/core';

/**
 * Resolves once a navigation's render has committed: the scheduler is quiet, focus commands
 * included (view/04-scheduler.md "`settled()`"). A loop-guard error is logged, not thrown, so
 * scroll and focus still happen.
 */
export const rendered = (): Promise<void> =>
  settled().catch((error: unknown) => {
    console.error('gyral router:', error);
  });

// `settled()` (docs/design-docs/view/04-scheduler.md "`settled()`"): wait until rendering is
// quiet. Implemented on the global scheduler: no host is dirty, no flush is scheduled, no
// view-transition update is pending, the post-render queue has run, and outputs sent to
// parents have been delivered. It covers rendering only: driver work (HTTP, timers) is outside
// it. Tests await it before asserting on the DOM.
import { isQuiet, whenQuiet } from './scheduler.js';

/** Rounds of "wait for the next quiet flush" before settled() gives up: a cycle. */
const MAX_ROUNDS = 100;

/**
 * Microtask turns first, so follow-ups that are already resolving (a driver that answered at
 * once, an output on its way to a parent) reach the scheduler before quiet is judged.
 */
const DRAIN_TURNS = 4;

async function drain(): Promise<void> {
  for (let turn = 0; turn < DRAIN_TURNS; turn += 1) await Promise.resolve();
}

/**
 * Resolves once rendering is quiet: every connected Gyral host has rendered its latest state,
 * view-transition updates have run, and focus commands and outputs have been delivered (an
 * output that makes a parent render is waited for too). Rejects with the loop guard's error
 * when rendering never settles in development (components feeding each other).
 *
 *   el.send({ _tag: 'Increment' });
 *   await settled();
 */
export async function settled(): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // Wait for a pending flush before draining, so its outcome (a loop-guard error) reaches us.
    const pending = isQuiet() ? undefined : whenQuiet();
    await drain();
    if (pending !== undefined) await pending;
    else if (isQuiet()) return;
  }
  throw new Error(
    `settled(): rendering did not settle after ${String(MAX_ROUNDS)} flushes. ` +
      'Components are probably feeding each other props or messages in a cycle.',
  );
}

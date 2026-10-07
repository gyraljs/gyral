// `settled()` (docs/design-docs/view/04-scheduler.md "`settled()`"): wait until the page is
// quiet. Implemented on the global scheduler: no host is dirty, no flush is scheduled, no
// view-transition update is pending, the post-render queue has run, outputs sent to parents
// have been delivered, and no message has reached a host or a store for QUIET_TURNS microtask
// turns in a row. Commands that are still running (streams that never end, requests waiting
// for a server) don't count: only the messages they deliver do. Timers are never advanced or
// waited for. Tests await it before asserting on the DOM.
import { activityCount, isQuiet, whenQuiet } from './scheduler.js';

/** Flushes and busy turns settled() waits through before it gives up: a cycle. */
const MAX_ROUNDS = 100;

/**
 * Consecutive microtask turns with no message and nothing to render before the page counts as
 * quiet, so follow-ups that are already resolving (a driver that answered at once, a store
 * notifying its subscribers in a microtask, a stream re-arming in one) reach a host first.
 */
const QUIET_TURNS = 8;

const cycle = (): Error =>
  new Error(
    `settled(): the page did not settle after ${String(MAX_ROUNDS)} flushes or busy turns. ` +
      'Components (or drivers) are probably feeding each other messages in a cycle.',
  );

/**
 * Resolves once the page is quiet: every connected Gyral host has rendered its latest state,
 * view-transition updates have run, focus commands and outputs have been delivered, and
 * messages have stopped arriving (a stream's next value, already on its way in a microtask, is
 * waited for; long-lived commands themselves are not). Rejects with the loop guard's error
 * when rendering never settles in development (components feeding each other).
 *
 *   el.send({ _tag: 'Increment' });
 *   await settled();
 */
export async function settled(): Promise<void> {
  let rounds = 0;
  let quietTurns = 0;
  let seen = activityCount();
  for (;;) {
    if (!isQuiet()) {
      // Ask for the flush's promise before it runs, so its outcome (a loop-guard error) reaches us.
      if (++rounds > MAX_ROUNDS) throw cycle();
      await whenQuiet();
      quietTurns = 0;
      seen = activityCount();
      continue;
    }
    await Promise.resolve();
    const now = activityCount();
    if (now !== seen) {
      // A message arrived (its host may already have rendered): start the quiet window again.
      if (++rounds > MAX_ROUNDS) throw cycle();
      seen = now;
      quietTurns = 0;
    } else if (isQuiet() && ++quietTurns >= QUIET_TURNS) {
      return;
    }
  }
}

// `settled()`: wait until rendering is quiet (docs/design-docs/view/04-scheduler.md). It resolves
// when no connected Gyral host has a pending update, no view-transition update is pending, and
// the post-render work (focus commands, outputs, `Hydrated`) has run. It covers rendering only:
// driver work (HTTP, timers) is outside it. Tests use it instead of `el.updateComplete`.
//
// Until the view-layer swap (ADR 0018) it is backed by Lit: define() registers connected hosts
// and tracks its post-render promises here. After the swap, the global scheduler implements the
// same contract and this module goes.

/** What settled() needs from a connected host: Lit's public update state. */
export interface SettleHost {
  readonly isUpdatePending: boolean;
  readonly updateComplete: Promise<unknown>;
}

const hosts = new Set<SettleHost>();
const work = new Set<Promise<unknown>>();

/** Rounds of "await pending work" before settled() gives up: a cycle, not slow rendering. */
const MAX_ROUNDS = 100;

/** Microtask turns to let untracked follow-ups (a resolved driver, a `.then`) run first. */
const DRAIN_TURNS = 4;

const ignore = (): void => undefined;

/** define(): a host joins on connect (when it can update) and leaves on disconnect. */
export function trackHost(host: SettleHost): void {
  hosts.add(host);
}

export function untrackHost(host: SettleHost): void {
  hosts.delete(host);
}

/** define(): post-render work (a transition update, a focus command, an output) in flight. */
export function trackWork<T>(promise: Promise<T>): Promise<T> {
  const tracked = promise.then(ignore, ignore);
  work.add(tracked);
  void tracked.then(() => work.delete(tracked));
  return promise;
}

async function drain(): Promise<void> {
  for (let turn = 0; turn < DRAIN_TURNS; turn += 1) await Promise.resolve();
}

/**
 * Resolves once rendering is quiet: every connected Gyral host has rendered its latest state,
 * view-transition updates have run, and focus commands and outputs have been delivered (an
 * output that makes a parent render is waited for too). Resolves after a few microtasks when
 * nothing is pending. Throws when rendering never settles (components feeding each other).
 *
 *   el.send({ _tag: 'Increment' });
 *   await settled();
 */
export async function settled(): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    await drain();
    const busy = [...hosts].filter((host) => host.isUpdatePending);
    if (busy.length === 0 && work.size === 0) return;
    await Promise.all([...work, ...busy.map((host) => host.updateComplete.catch(ignore))]);
  }
  throw new Error(
    `settled(): rendering did not settle after ${String(MAX_ROUNDS)} rounds. ` +
      'Components are probably feeding each other props or messages in a cycle.',
  );
}

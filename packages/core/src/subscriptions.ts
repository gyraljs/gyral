// Declarative subscriptions (ADR 0025, view/05-element.md "Subscriptions"): `spec.subscriptions`
// says which long-lived commands should be running for the current state and props, and this
// module keeps the running set equal to it. Reached through `#spec-features` (registered by
// the build when a module names the field), so apps that don't use it don't bundle it.
//
// The rules: once the host has rendered, and after every update and props change while it is
// connected, `subscriptions(state, props)` is evaluated and synced. Commands are matched by
// lane (`key`, else the driver's name). A lane that is new starts; a lane that is gone is
// aborted; a lane whose input changed (compared by its JSON text, else by identity) is aborted
// and started again; a lane with the same input keeps running. A subscription that ends by
// itself stays ended until its lane or input changes. When the host's commands stop (removal,
// ADR 0006) the set is forgotten, and the next connect starts it again from the current state.
import type { Command } from './command.js';
import { DEV, message } from './view/index.js';

/** What syncing needs from the host's interpreter. */
export interface SubscriptionRunner<M> {
  readonly run: (cmd: Command<M>) => void;
  readonly cancel: (lane: string) => void;
}

/** One host's subscriptions. */
export interface Subscriptions {
  /** Evaluates `subscriptions` and makes the running set equal to its result. */
  readonly update: () => void;
  /** Forgets the running set (the host's commands were stopped). */
  readonly reset: () => void;
}

/** An input's identity for the diff: its JSON text, or the value when it has none. */
const fingerprint = (input: unknown): unknown => {
  try {
    // `undefined` for values with no JSON text (functions, `undefined`).
    const text = JSON.stringify(input) as string | undefined;
    return text ?? input;
  } catch {
    return input; // cyclic or BigInt: compared by identity
  }
};

/**
 * `derive` evaluates the spec field for the current state and props; a throw goes to `failed`
 * (reported as an update failure, ADR 0024) and leaves the running set as it was.
 */
export function subscriptionSet<M>(
  tag: string,
  derive: () => readonly Command<M>[],
  runner: SubscriptionRunner<M>,
  failed: (cause: unknown) => void,
): Subscriptions {
  const running = new Map<string, unknown>();
  // A command can emit while it starts (a timer that fires at once), so its message's update
  // asks to sync again in the middle of a sync: it runs once this one is done.
  let syncing = false;
  let again = false;
  const askedAgain = (): boolean => again; // read through a call: sync() may set it
  const sync = (): void => {
    let commands: readonly Command<M>[];
    try {
      commands = derive();
    } catch (cause) {
      failed(cause);
      return;
    }
    const seen = new Set<string>();
    for (const cmd of commands) {
      const lane = cmd.key ?? cmd.driver.name;
      if (seen.has(lane)) {
        if (DEV) console.warn(message(79, tag, lane));
        continue;
      }
      seen.add(lane);
      const print = fingerprint(cmd.input);
      if (running.has(lane)) {
        if (Object.is(running.get(lane), print)) continue;
        runner.cancel(lane);
      }
      running.set(lane, print);
      runner.run(cmd);
    }
    for (const lane of running.keys()) {
      if (seen.has(lane)) continue;
      runner.cancel(lane);
      running.delete(lane);
    }
  };
  return {
    update() {
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      try {
        // A subscription whose input depends on what it emits would restart forever.
        for (let rounds = 0; rounds < 100; rounds++) {
          again = false;
          sync();
          if (!askedAgain()) return;
        }
        failed(new Error(message(80, tag)));
      } finally {
        syncing = false;
      }
    },
    reset() {
      running.clear();
    },
  };
}

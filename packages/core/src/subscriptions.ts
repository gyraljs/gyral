// Declarative subscriptions (ADR 0025, view/05-element.md "Subscriptions"): `spec.subscriptions`
// says which long-lived commands should be running for the current state and props, and this
// module keeps the running set equal to it. Reached through `#spec-features` (registered by
// the build when a module names the field), so apps that don't use it don't bundle it.
//
// The rules: once the host has rendered, and after every update and props change while it is
// connected, `subscriptions(state, props)` is evaluated and synced. Commands are matched by
// lane (`key`, else the driver's name). A lane that is new starts; a lane that is gone is
// aborted; a lane whose input changed (compared as JSON text, functions ignored) is aborted
// and started again; a lane with the same input keeps running. A subscription that ends by
// itself stays ended until its lane or input changes. When the host's commands stop (removal,
// ADR 0006) the set is forgotten, and the next connect starts it again from the current state.
import type { Command } from './command.js';
import { DEV, message } from './view/index.js';

/** What syncing needs from the host's model (host-model.ts). */
export interface SubscriptionHost<M> {
  readonly tag: string;
  state(): unknown;
  ctx(): { readonly props: unknown };
  /** Runs commands as a reducer's would. */
  run(commands: readonly Command<M>[]): void;
  /** Aborts the running task of `lane`. */
  cancel(lane: string): void;
  fail(cause: unknown, phase: 'update', text: string, msg: string): unknown;
}

/** One host's subscriptions. */
export interface Subscriptions {
  /** Evaluates `subscriptions` and makes the running set equal to its result. */
  readonly update: () => void;
  /** Forgets the running set (the host's commands were stopped). */
  readonly reset: () => void;
}

/**
 * An input's identity for the diff: its data as JSON text. Functions inside it count as equal
 * (an inline selector, `watch(store, (s) => s.x)`, is a new function after every message, and
 * comparing it would restart the lane each time), repeated objects and cycles are cut, and
 * BigInts are written out. So a changed key or changed data restarts a lane; a changed function
 * alone doesn't: to restart on a new selector, change the key (gyral-1zd.29).
 */
const fingerprint = (input: unknown): string => {
  const seen = new WeakSet<object>();
  // Wrapped in an array, so even `undefined` has a text (`[null]`).
  return JSON.stringify([input], (_key, value: unknown) => {
    if (typeof value === 'function') return '[function]';
    if (typeof value === 'bigint') return `${value.toString()}n`;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[seen]';
      seen.add(value);
    }
    return value;
  });
};

/**
 * `derive` is the spec field. A throw is reported as an update failure (ADR 0024) and leaves
 * the running set as it was.
 */
export function subscriptionSet<M>(
  host: SubscriptionHost<M>,
  derive: (state: never, props: never) => readonly Command<M>[],
): Subscriptions {
  const tag = host.tag;
  const running = new Map<string, unknown>();
  // A command can emit while it starts (a timer that fires at once), so its message's update
  // asks to sync again in the middle of a sync: it runs once this one is done.
  let syncing = false;
  let again = false;
  const askedAgain = (): boolean => again; // read through a call: sync() may set it
  const sync = (): void => {
    let commands: readonly Command<M>[];
    try {
      // Sound: the host passes its own state and props to its own spec's field.
      commands = derive(host.state() as never, host.ctx().props as never);
    } catch (cause) {
      host.fail(cause, 'update', message(73, tag, 'subscriptions'), 'subscriptions');
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
        host.cancel(lane);
      }
      running.set(lane, print);
      host.run([cmd]);
    }
    for (const lane of running.keys()) {
      if (seen.has(lane)) continue;
      host.cancel(lane);
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
        host.fail(new Error(message(80, tag)), 'update', message(80, tag), 'subscriptions');
      } finally {
        syncing = false;
      }
    },
    reset() {
      running.clear();
    },
  };
}

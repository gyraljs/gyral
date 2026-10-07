// A small stand-in for a TC39-signals store that Gyral doesn't own (test helper, no
// dependency). It keeps the two properties that matter to settled(): a watcher's `notify`
// runs once when a watched value changes and may not read values there, so the reader
// re-arms (`watch()`) and reads in a later microtask; and with `batched`, notifications are
// delivered in a microtask, as effect schedulers built on watchers do.

export interface Watcher {
  /** Arms the watcher again after a notification. */
  readonly watch: () => void;
  readonly unwatch: () => void;
}

export interface SignalLike<T> {
  readonly get: () => T;
  readonly set: (value: T) => void;
  readonly watcher: (notify: () => void) => Watcher;
  /** Watchers currently registered (for cleanup assertions). */
  readonly watchers: () => number;
}

export function signalLike<T>(initial: T, { batched = false } = {}): SignalLike<T> {
  let value = initial;
  const watchers = new Set<{ armed: boolean; readonly notify: () => void }>();
  const notifyAll = (): void => {
    for (const w of [...watchers]) {
      if (!w.armed) continue;
      w.armed = false;
      w.notify();
    }
  };
  return {
    get: () => value,
    set: (next) => {
      value = next;
      if (batched) queueMicrotask(notifyAll);
      else notifyAll();
    },
    watcher: (notify) => {
      const w = { armed: true, notify };
      watchers.add(w);
      return {
        watch: () => {
          w.armed = true;
        },
        unwatch: () => {
          watchers.delete(w);
        },
      };
    },
    watchers: () => watchers.size,
  };
}

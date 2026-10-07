// What the time commands share (index.ts, and delay.ts for delay-only apps): their lanes, the
// command builder, and the abortable wait.
import { command, type Command, type Concurrency, type Driver } from '@gyral/core';

/** Concurrency lane for a timer. Timers in different lanes run independently. */
export interface Lane {
  /** Lane name. Default: one shared lane per command kind (see each command). */
  readonly key?: string;
  readonly concurrency?: Concurrency;
}

/** A time command for `driver`, in the caller's lane or the command kind's default one. */
export function timer<I, O, M>(
  driver: Driver<I, O>,
  input: I,
  toMsg: (output: O) => M | undefined,
  lane: Lane,
  defaults: Required<Lane>,
): Command<M> {
  return command<I, O, unknown, M>(driver, input, {
    onSuccess: toMsg,
    key: lane.key ?? defaults.key,
    concurrency: lane.concurrency ?? defaults.concurrency,
  });
}

/** The reason an aborted command rejects with. */
export const abortError = (signal: AbortSignal): Error => {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
};

/** Resolves after `ms`, or rejects when `signal` aborts first (and clears the timer). */
export function wait(ms: number, signal: AbortSignal): Promise<undefined> {
  return new Promise<undefined>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      resolve(undefined);
    }, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}

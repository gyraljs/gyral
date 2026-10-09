// Streaming drivers over sources Gyral doesn't own (ADR 0006 "Outside sources"): TC39 signals,
// Redux-style stores, XState actors, WebSocket feeds. `subscription()` turns "subscribe and
// return how to stop" into a driver: values become messages through the command's
// `onSuccess`, and the source is released when the command is switched away or its component
// disconnects. A standalone module: apps that don't import it don't bundle it.
import type { Concurrency, Driver } from './command.js';
import { fail } from './errors.js';
import { message } from './view/index.js';

/** How to stop listening: a function, or an object with `unsubscribe()` (RxJS, XState). */
export type Unsubscribe = (() => void) | { readonly unsubscribe: () => void };

export interface SubscriptionContext<I> {
  /** The command's input (a room code, a URL, a store key). */
  readonly input: I;
  /** Aborts when the command is switched away or its component disconnects. */
  readonly signal: AbortSignal;
  /**
   * Ends the subscription with an error: the source is released and the command's
   * `onFailure` gets it. Wrap the driver in `retry()` to subscribe again instead.
   */
  readonly fail: (error: unknown) => void;
}

/** Driver options a subscription may set. `concurrency` defaults to `'switch'`. */
export interface SubscriptionOptions<E> {
  readonly concurrency?: Concurrency;
  readonly toError?: (cause: unknown) => E;
}

const release = (name: string, stop: Unsubscribe | undefined): void => {
  if (stop === undefined) return;
  try {
    if (typeof stop === 'function') stop();
    else stop.unsubscribe();
  } catch (error) {
    fail(error, 'subscribe', message(42, name), { msg: name });
  }
};

const asError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');

/**
 * A streaming driver over a source Gyral doesn't own. `subscribe` starts listening, calls
 * `emit` with each value (it may emit the current value at once) and returns how to stop
 * (a function, or an object with `unsubscribe()`).
 * The subscription lasts while the command runs; aborting it (lane `switch`, disconnect)
 * releases the source, and emits after that are ignored. Substitute it by `name` in tests.
 *
 *   const cart = subscription<CartState>('cart', (emit) => {
 *     emit(reduxStore.getState());
 *     return reduxStore.subscribe(() => emit(reduxStore.getState()));
 *   });
 *   // init: [state, [command(cart, undefined, { onSuccess: (c) => ({ _tag: 'Cart', c }) })]]
 */
export function subscription<O, I = undefined, E = unknown>(
  name: string,
  subscribe: (emit: (value: O) => void, ctx: SubscriptionContext<I>) => Unsubscribe,
  options: SubscriptionOptions<E> = {},
): Driver<I, O, E> {
  return {
    name,
    concurrency: 'switch',
    ...options,
    run: (input, { signal, emit }) =>
      new Promise<never>((_resolve, reject) => {
        // `ended` may flip inside subscribe (fail() or an abort), so it lives in an object.
        const sub: { ended: boolean; stop?: Unsubscribe } = { ended: false };
        // Deliberately not wrapped in an Error: the driver's toError (or onFailure) sees the
        // source's own error (a WebSocket's error event, a store's rejection).
        const end = (error: unknown): void => {
          if (sub.ended) return;
          sub.ended = true;
          signal.removeEventListener('abort', onAbort);
          release(name, sub.stop);
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        };
        const onAbort = (): void => {
          end(asError(signal.reason));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          const stop = subscribe(
            (value) => {
              if (!sub.ended) emit(value);
            },
            { input, signal, fail: end },
          );
          // fail() or an abort while subscribing ended it before `stop` was known.
          if (sub.ended) release(name, stop);
          else sub.stop = stop;
        } catch (error) {
          end(error);
        }
      }),
  };
}

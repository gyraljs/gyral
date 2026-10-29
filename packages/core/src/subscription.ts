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

/**
 * Driver options a subscription may set. `concurrency` defaults to `'switch'`. What reaches the
 * component: `select` maps each emitted value first, `equals` drops a value equal
 * to the last one delivered (`Object.is` is a common choice), and `coalesce` delivers only the
 * latest value per microtask or animation frame. By default every emitted value is delivered.
 */
export interface SubscriptionOptions<E, V = never, O = V> {
  readonly concurrency?: Concurrency;
  readonly toError?: (cause: unknown) => E;
  readonly select?: (value: V) => O;
  readonly equals?: (prev: O, next: O) => boolean;
  readonly coalesce?: 'microtask' | 'frame';
}

/** `emit` for a subscription's source: `select`, `coalesce`, then `equals`, then `deliver`. */
function delivery<V, O>(
  deliver: (value: O) => void,
  options: Pick<SubscriptionOptions<unknown, V, O>, 'select' | 'equals' | 'coalesce'>,
): (value: V) => void {
  const { select, equals, coalesce } = options;
  let last: { readonly value: O } | undefined;
  let pending: { readonly value: O } | undefined;
  const send = (value: O): void => {
    if (last !== undefined && equals?.(last.value, value) === true) return;
    last = { value };
    deliver(value);
  };
  const flush = (): void => {
    const next = pending;
    pending = undefined;
    if (next !== undefined) send(next.value);
  };
  return (raw) => {
    const value = select === undefined ? (raw as unknown as O) : select(raw);
    if (coalesce === undefined) {
      send(value);
      return;
    }
    const scheduled = pending !== undefined;
    pending = { value };
    if (scheduled) return;
    if (coalesce === 'frame') requestAnimationFrame(flush);
    else queueMicrotask(flush);
  };
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
 *   // subscriptions: () => [command(cart, undefined, { onSuccess: (c) => ({ _tag: 'Cart', c }) })]
 */
export function subscription<O, I = undefined, E = unknown, V = O>(
  name: string,
  subscribe: (emit: (value: V) => void, ctx: SubscriptionContext<I>) => Unsubscribe,
  options?: SubscriptionOptions<E, V, O>,
): Driver<I, O, E>;
/**
 * The subscription that implements a driver token (`defineDriver<I, O, E>('feed')`, ADR 0006
 * addendum "Typed provision"): named by the token, its values and input typed by it.
 *
 *   provideDrivers(root, [subscription(feed, (emit) => session.subscribe(emit))]);
 */
export function subscription<I, O, E, V = O>(
  token: Driver<I, O, E>,
  subscribe: (emit: (value: V) => void, ctx: SubscriptionContext<I>) => Unsubscribe,
  options?: SubscriptionOptions<E, V, O>,
): Driver<I, O, E>;
export function subscription<O, I, E, V>(
  of: string | Driver<I, O, E>,
  subscribe: (emit: (value: V) => void, ctx: SubscriptionContext<I>) => Unsubscribe,
  options: SubscriptionOptions<E, V, O> = {},
): Driver<I, O, E> {
  // A token's name and policy (not its run or provide), then the options.
  const token: Omit<Driver<I, O, E>, 'run'> = typeof of === 'string'
    ? { name: of }
    : {
        name: of.name,
        ...(of.concurrency === undefined ? {} : { concurrency: of.concurrency }),
        ...(of.toError === undefined ? {} : { toError: of.toError }),
      };
  const { concurrency, toError } = options;
  return {
    concurrency: 'switch',
    ...token,
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(toError === undefined ? {} : { toError }),
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
          release(token.name, sub.stop);
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
          const deliver = (value: O): void => {
            if (!sub.ended) emit(value);
          };
          const stop = subscribe(delivery(deliver, options), {
            input,
            signal,
            fail: end,
          });
          // fail() or an abort while subscribing ended it before `stop` was known.
          if (sub.ended) release(token.name, stop);
          else sub.stop = stop;
        } catch (error) {
          end(error);
        }
      }),
  };
}

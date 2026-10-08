// Retries as a driver wrapper (ADR 0022): the interpreter runs a driver once, and apps that
// never call `retry` don't bundle its delays. A standalone module, like subscription.ts.
import type { Driver, RetryPolicy } from './command.js';

/** Waits `ms`, or rejects with the abort reason as soon as `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const stop = (): void => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal.addEventListener('abort', stop, { once: true });
  });

/**
 * The same driver (same name, so substitution by name still works), with `run` retried when it
 * rejects: up to `policy.times` more attempts, after `delayMs` (doubling from it with
 * `backoff: 'exponential'`). An abort (the command switched away, the component disconnected)
 * ends it at once and is never retried. Wrap where the driver is chosen: app setup, a
 * component's `drivers`, or a test fake.
 *
 *   const api = retry(makeHttpDriver({ baseUrl: '/api' }), { times: 2, delayMs: 300 });
 *   const feed = retry(subscription('feed', connect), { times: Infinity, delayMs: 1000 });
 */
export function retry<I, O, E>(driver: Driver<I, O, E>, policy: RetryPolicy): Driver<I, O, E> {
  const base = policy.delayMs ?? 0;
  return {
    ...driver,
    run: async (input, ctx) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await driver.run(input, ctx);
        } catch (cause) {
          if (ctx.signal.aborted || attempt >= policy.times) throw cause;
          await sleep(policy.backoff === 'exponential' ? base * 2 ** attempt : base, ctx.signal);
        }
      }
    },
  };
}

// What reaches the component from a subscription (gyral-337.1): select maps each emitted value,
// equals drops one equal to the last delivered, coalesce keeps only the latest per microtask or
// frame. By default every value is delivered.
import { expect, it } from 'vitest';
import { subscription, type SubscriptionOptions } from '../src/index.js';

/** Runs `options`' subscription over a source that emits `values` at once; what it delivers. */
async function delivered<V, O>(
  values: readonly V[],
  options: SubscriptionOptions<unknown, V, O> = {},
): Promise<unknown[]> {
  const out: unknown[] = [];
  const driver = subscription<O, undefined, unknown, V>(
    'test-source',
    (emit) => {
      for (const value of values) emit(value);
      return () => undefined;
    },
    options,
  );
  const abort = new AbortController();
  const done = Promise.resolve(
    driver.run(undefined, { signal: abort.signal, emit: (v) => out.push(v) }),
  ).catch(() => undefined);
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  abort.abort();
  await done;
  return out;
}

it('delivers every value by default', async () => {
  expect(await delivered([1, 1, 2])).toEqual([1, 1, 2]);
});

it('maps with select, and drops repeats with equals', async () => {
  const state = (n: number) => ({ count: n, other: Math.random() });
  const values = [state(1), state(1), state(2), state(2), state(1)];
  expect(await delivered(values, { select: (s) => s.count, equals: Object.is })).toEqual([1, 2, 1]);
});

it('keeps the latest value per microtask or per frame with coalesce', async () => {
  expect(await delivered([1, 2, 3], { coalesce: 'microtask' })).toEqual([3]);
  expect(await delivered([1, 2, 3], { coalesce: 'frame' })).toEqual([3]);
  expect(await delivered([1, 2, 2], { coalesce: 'microtask', equals: Object.is })).toEqual([2]);
});

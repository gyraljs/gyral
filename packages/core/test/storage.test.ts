import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { makeLocalStorageDriver, type StorageInput, type StorageOutput } from '../src/storage.js';

const prefix = 'gyral-storage-test:';
const schema = v.object({ theme: v.string() });
const driver = makeLocalStorageDriver(schema, { prefix });
type Value = v.InferOutput<typeof schema>;
const controllers: AbortController[] = [];
const control = () => {
  const c = new AbortController();
  controllers.push(c);
  return c;
};
const run = (input: StorageInput<Value>) =>
  driver.run(input, { signal: control().signal, emit: () => undefined });

function watch<T>(source: ReturnType<typeof makeLocalStorageDriver<T>>, key = 'settings') {
  const controller = control();
  const values: StorageOutput<T>[] = [];
  const done = Promise.resolve(
    source.run(
      { _tag: 'Watch', key },
      {
        signal: controller.signal,
        emit: (value) => {
          values.push(value);
        },
      },
    ),
  ).catch((error: unknown) => error);
  return { controller, values, done };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('optional localStorage driver', () => {
  it('distinguishes absent values, decoded records, removal and invalid stored data', async () => {
    expect(await run({ _tag: 'Read', key: 'settings' })).toEqual({
      _tag: 'StorageValue',
      key: 'settings',
      entry: { found: false },
    });
    expect(await run({ _tag: 'Write', key: 'settings', value: { theme: 'dark' } })).toEqual({
      _tag: 'StorageWritten',
      key: 'settings',
    });
    expect(await run({ _tag: 'Read', key: 'settings' })).toEqual({
      _tag: 'StorageValue',
      key: 'settings',
      entry: { found: true, value: { theme: 'dark' } },
    });
    await run({ _tag: 'Remove', key: 'settings' });
    expect(localStorage.getItem(prefix + 'settings')).toBeNull();
    for (const raw of ['invalid json', '{"theme":4}']) {
      localStorage.setItem(prefix + 'settings', raw);
      const error = await Promise.resolve(run({ _tag: 'Read', key: 'settings' })).catch(
        (cause: unknown) => driver.toError?.(cause),
      );
      expect(error).toMatchObject({ _tag: 'StorageDecodeError', key: 'settings' });
    }
  });

  it('watches initial state and own writes across driver instances; Clear preserves other namespaces', async () => {
    const current = watch(driver);
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(1);
    });
    const second = makeLocalStorageDriver(schema, { name: 'other-storage', prefix });
    await second.run(
      { _tag: 'Write', key: 'settings', value: { theme: 'light' } },
      { signal: control().signal, emit: () => undefined },
    );
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(2);
    });
    expect(current.values[1]).toMatchObject({
      _tag: 'StorageChanged',
      source: 'driver',
      entry: { found: true, value: { theme: 'light' } },
    });
    localStorage.setItem('gyral-storage-unrelated', 'keep');
    try {
      await run({ _tag: 'Clear' });
      await vi.waitFor(() => {
        expect(current.values).toHaveLength(3);
      });
      expect(current.values[2]).toMatchObject({ entry: { found: false } });
      expect(localStorage.getItem('gyral-storage-unrelated')).toBe('keep');
    } finally {
      localStorage.removeItem('gyral-storage-unrelated');
    }
  });

  it('uses real cross-document storage events and removes listeners on cancellation', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const current = watch(driver);
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(1);
    });
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const other = frame.contentWindow;
    if (other === null) throw new Error('No other browsing context');
    other.localStorage.setItem(prefix + 'settings', '{"theme":"other-tab"}');
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(2);
    });
    expect(current.values[1]).toMatchObject({
      source: 'tab',
      entry: { found: true, value: { theme: 'other-tab' } },
    });
    other.localStorage.removeItem(prefix + 'settings');
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(3);
    });
    expect(current.values[2]).toMatchObject({ source: 'tab', entry: { found: false } });
    current.controller.abort();
    await current.done;
    expect(remove.mock.calls.some(([event]) => event === 'storage')).toBe(true);
    await run({ _tag: 'Write', key: 'settings', value: { theme: 'late' } });
    expect(current.values).toHaveLength(3);
  });

  it('reports malformed watch values and continues observing later valid values', async () => {
    localStorage.setItem(prefix + 'settings', 'bad');
    const current = watch(driver);
    await vi.waitFor(() => {
      expect(current.values[0]).toMatchObject({ _tag: 'StorageDecodeFailed' });
    });
    await run({ _tag: 'Write', key: 'settings', value: { theme: 'fixed' } });
    await vi.waitFor(() => {
      expect(current.values[1]).toMatchObject({ _tag: 'StorageChanged', entry: { found: true } });
    });
  });

  it('orders async decoding and suppresses a result completed after cancellation', async () => {
    const pending = new Map<number, (value: StandardSchemaV1.Result<number>) => void>();
    const delayed: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => {
          if (value === 1 || value === 3)
            return new Promise((resolve) => {
              pending.set(value, resolve);
            });
          return typeof value === 'number'
            ? { value }
            : { issues: [{ message: 'Number required' }] };
        },
      },
    };
    const numbers = makeLocalStorageDriver(delayed, { prefix });
    const current = watch(numbers, 'n');
    const write = (value: number) =>
      numbers.run(
        { _tag: 'Write', key: 'n', value },
        { signal: control().signal, emit: () => undefined },
      );
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(1);
    });
    await write(1);
    await write(2);
    await vi.waitFor(() => {
      expect(pending.get(1)).toBeDefined();
    });
    expect(current.values).toHaveLength(1);
    pending.get(1)?.({ value: 1 });
    await vi.waitFor(() => {
      expect(current.values).toHaveLength(3);
    });
    expect(
      current.values
        .slice(1)
        .map((value) => (value._tag === 'StorageChanged' ? value.entry : undefined)),
    ).toEqual([
      { found: true, value: 1 },
      { found: true, value: 2 },
    ]);
    await write(3);
    await vi.waitFor(() => {
      expect(pending.get(3)).toBeDefined();
    });
    current.controller.abort();
    pending.get(3)?.({ value: 3 });
    await current.done;
    expect(current.values).toHaveLength(3);
  });

  it('accesses storage lazily and maps unavailable/quota failures to typed errors', async () => {
    const access = vi.fn((): Storage => {
      throw new DOMException('Quota or denied', 'QuotaExceededError');
    });
    const unavailable = makeLocalStorageDriver(schema, { storage: access });
    expect(access).not.toHaveBeenCalled();
    const error = await Promise.resolve(
      unavailable.run(
        { _tag: 'Write', key: 'x', value: { theme: 'dark' } },
        { signal: control().signal, emit: () => undefined },
      ),
    ).catch((cause: unknown) => unavailable.toError?.(cause));
    expect(error).toEqual({
      _tag: 'StorageAccessError',
      operation: 'Write',
      key: 'x',
      message: 'Quota or denied',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { makeIndexedDBDriver } from '../src/indexeddb.js';
import { connect, fixture, stores, upgrade, user } from './indexeddb-fixture.js';

describe('IndexedDB commit, upgrade and cancellation lifetime', () => {
  it('rolls back a whole batch on a later constraint error or synchronous clone failure', async () => {
    const { run, error } = fixture();
    const failure = await error({
      _tag: 'Transaction',
      operations: [
        { _tag: 'Put', store: 'values', key: 'rollback', value: true },
        { _tag: 'Put', store: 'users', value: user(1) },
        { _tag: 'Put', store: 'users', value: { ...user(2), email: user(1).email } },
      ],
    });
    expect(failure).toMatchObject({
      _tag: 'IndexedDBAccessError',
      phase: 'transaction',
      name: 'ConstraintError',
    });
    expect(await run({ _tag: 'Read', store: 'values', key: 'rollback' })).toMatchObject({
      entry: { found: false },
    });
    expect(await run({ _tag: 'Read', store: 'users', key: 1 })).toMatchObject({
      entry: { found: false },
    });
    expect(
      await error({
        _tag: 'Transaction',
        operations: [
          { _tag: 'Put', store: 'values', key: 'rollback', value: true },
          { _tag: 'Put', store: 'values', key: 'clone-error', value: () => undefined },
        ],
      }),
    ).toMatchObject({ _tag: 'IndexedDBAccessError', phase: 'transaction', name: 'DataCloneError' });
    expect(await run({ _tag: 'Read', store: 'values', key: 'rollback' })).toMatchObject({
      entry: { found: false },
    });
  });

  it('aborts in-flight native transactions and removes the AbortSignal listener', async () => {
    const { run } = fixture();
    await run({ _tag: 'Put', store: 'users', value: user(1) });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with its native receiver via apply
    const original = IDBObjectStore.prototype.openCursor;
    vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = original.apply(this, args);
      request.addEventListener(
        'success',
        () => {
          controller.abort();
        },
        { once: true },
      );
      return request;
    });
    await expect(
      run(
        {
          _tag: 'Transaction',
          operations: [
            { _tag: 'Put', store: 'values', key: 'cancelled', value: true },
            { _tag: 'Read', store: 'users', key: 1 },
          ],
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(remove.mock.calls.some(([type]) => type === 'abort')).toBe(true);
    vi.restoreAllMocks();
    expect(await run({ _tag: 'Read', store: 'values', key: 'cancelled' })).toMatchObject({
      entry: { found: false },
    });
  });

  it('rejects blocked upgrades promptly, discards their late upgrade and recovers on retry', async () => {
    const { database } = fixture();
    const old = await connect(database, 1);
    const migrate = vi.fn(upgrade);
    const driver = makeIndexedDBDriver(stores, { database, version: 2, upgrade: migrate });
    const input = { _tag: 'Query', store: 'users', index: 'name', limit: 1 } as const;
    const run = () =>
      Promise.resolve(
        driver.run(input, { signal: new AbortController().signal, emit: () => undefined }),
      );
    try {
      expect(await run().catch((cause: unknown) => driver.toError?.(cause))).toEqual({
        _tag: 'IndexedDBBlockedError',
        database,
        version: 2,
      });
      expect(migrate).not.toHaveBeenCalled();
    } finally {
      old.close();
    }
    // The abandoned open request is ahead of this one; it must not run app migrations.
    expect(await run()).toMatchObject({ _tag: 'Records', records: [] });
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(migrate.mock.calls[0]?.slice(1, 3)).toEqual([1, 2]);
  });

  it('aborts an open/upgrade and does not leak a late connection', async () => {
    const { options } = fixture();
    const controller = new AbortController();
    const original = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
      const request = original(...args);
      request.addEventListener(
        'upgradeneeded',
        () => {
          controller.abort();
        },
        { once: true },
      );
      return request;
    });
    const driver = makeIndexedDBDriver(stores, options);
    await expect(
      Promise.resolve(
        driver.run(
          { _tag: 'Read', store: 'users', key: 1 },
          { signal: controller.signal, emit: () => undefined },
        ),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    vi.restoreAllMocks();
    expect(
      await driver.run(
        { _tag: 'Read', store: 'users', key: 1 },
        { signal: new AbortController().signal, emit: () => undefined },
      ),
    ).toMatchObject({ entry: { found: false } });
  });

  it('aborts a throwing migration and permits a later valid upgrade', async () => {
    const { options } = fixture();
    const broken = makeIndexedDBDriver(stores, {
      ...options,
      upgrade: (db) => {
        db.createObjectStore('partial');
        throw new Error('Migration rejected');
      },
    });
    const failure = await Promise.resolve(
      broken.run(
        { _tag: 'Read', store: 'users', key: 1 },
        { signal: new AbortController().signal, emit: () => undefined },
      ),
    ).catch((cause: unknown) => broken.toError?.(cause));
    expect(failure).toMatchObject({
      _tag: 'IndexedDBAccessError',
      phase: 'upgrade',
      message: 'Migration rejected',
    });
    const db = await connect(options.database, 1);
    expect(db.objectStoreNames.contains('partial')).toBe(false);
    db.close();
  });

  it('closes the connection before async decoding and suppresses an aborted decoder result', async () => {
    const { options, run } = fixture();
    await run({ _tag: 'Put', store: 'users', value: user(1) });
    const pending = new Map<string, (result: StandardSchemaV1.Result<unknown>) => void>();
    const delayed: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () =>
          new Promise((resolve) => {
            pending.set('read', resolve);
          }),
      },
    };
    const reader = makeIndexedDBDriver({ users: delayed }, options);
    const controller = new AbortController();
    const result = Promise.resolve(
      reader.run(
        { _tag: 'Read', store: 'users', key: 1 },
        { signal: controller.signal, emit: () => undefined },
      ),
    );
    await vi.waitFor(() => {
      expect(pending.has('read')).toBe(true);
    });
    // An upgrade succeeds while decoding is still pending: the command has released its DB.
    const next = makeIndexedDBDriver(stores, { ...options, version: 2 });
    expect(
      await next.run(
        { _tag: 'Query', store: 'users', index: 'name', limit: 1 },
        { signal: new AbortController().signal, emit: () => undefined },
      ),
    ).toMatchObject({ records: [{ key: 1 }] });
    controller.abort();
    pending.get('read')?.({ value: user(1) });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});

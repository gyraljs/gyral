import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { command, define, html, settled } from '../src/index.js';
import { fakeDriver } from '../../testing/src/fake.js';
import {
  makeIndexedDBDriver,
  type IndexedDBInput,
  type IndexedDBOutput,
} from '../src/indexeddb.js';
import { connect, fixture, stores, user } from './indexeddb-fixture.js';

describe('optional IndexedDB operations', () => {
  it('reads, puts and deletes typed records, distinguishes absence from stored undefined', async () => {
    const { run } = fixture();
    expect(await run({ _tag: 'Read', store: 'users', key: 1 })).toMatchObject({
      entry: { found: false },
    });
    expect(await run({ _tag: 'Put', store: 'users', value: user(1) })).toEqual({
      _tag: 'Put',
      store: 'users',
      key: 1,
    });
    expect(await run({ _tag: 'Read', store: 'users', key: 1 })).toMatchObject({
      entry: { found: true, value: user(1) },
    });
    await run({ _tag: 'Delete', store: 'users', key: 1 });
    expect(await run({ _tag: 'Read', store: 'users', key: 1 })).toMatchObject({
      entry: { found: false },
    });
    await run({ _tag: 'Put', store: 'values', key: 'undefined', value: undefined });
    expect(await run({ _tag: 'Read', store: 'values', key: 'undefined' })).toMatchObject({
      entry: { found: true, value: undefined },
    });
    const binaryKey = new Uint8Array([1, 2]).buffer;
    await run({ _tag: 'Put', store: 'values', key: binaryKey, value: 'binary key' });
    expect(await run({ _tag: 'Read', store: 'values', key: binaryKey })).toMatchObject({
      entry: { found: true, value: 'binary key' },
    });
  });

  it('reports a batch only after commit, with reads seeing earlier batch writes', async () => {
    const { database, run } = fixture();
    let committed = false;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with its native receiver via apply
    const original = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args
    ) {
      const tx = original.apply(this, args);
      tx.addEventListener('complete', () => {
        committed = true;
      });
      return tx;
    });
    const result = await run({
      _tag: 'Transaction',
      operations: [
        { _tag: 'Put', store: 'users', value: user(1) },
        { _tag: 'Read', store: 'users', key: 1 },
        { _tag: 'Put', store: 'values', key: 'label', value: 'committed' },
      ],
    });
    expect(committed).toBe(true);
    expect(result).toMatchObject({
      _tag: 'Committed',
      results: [
        { _tag: 'Put', key: 1 },
        { _tag: 'Record', entry: { found: true, value: user(1) } },
        { _tag: 'Put', key: 'label' },
      ],
    });
    const db = await connect(database, 1);
    try {
      const tx = db.transaction('values');
      const request = tx.objectStore('values').get('label');
      expect(
        await new Promise<unknown>((resolve, reject) => {
          // Request success precedes transaction completion. Closing here would leave
          // this test-owned connection pending and race afterEach's leak assertion.
          tx.oncomplete = () => {
            resolve(request.result);
          };
          tx.onabort = () => {
            reject(tx.error ?? new Error('Verification read aborted.'));
          };
        }),
      ).toBe('committed');
    } finally {
      db.close();
    }
  });

  it('bounds index cursors by range, direction and limit, returning primary keys', async () => {
    const { run, error } = fixture();
    await run({
      _tag: 'Transaction',
      operations: [1, 2, 3, 4].map((id) => ({
        _tag: 'Put',
        store: 'users',
        value: user(id, Math.min(id, 2)),
      })),
    });
    const result = await run({
      _tag: 'Query',
      store: 'users',
      index: 'rank',
      range: { _tag: 'Bound', lower: 1, upper: 2 },
      direction: 'prev',
      limit: 2,
    });
    expect(result).toMatchObject({
      _tag: 'Records',
      records: [
        { key: 4, value: user(4, 2) },
        { key: 3, value: user(3, 2) },
      ],
    });
    expect(
      await run({
        _tag: 'Query',
        store: 'users',
        range: { _tag: 'Lower', key: 3, open: true },
        limit: 10,
      }),
    ).toMatchObject({ records: [{ key: 4 }] });
    expect(
      await run({
        _tag: 'Query',
        store: 'users',
        range: { _tag: 'Upper', key: 2, open: true },
        limit: 10,
      }),
    ).toMatchObject({ records: [{ key: 1 }] });
    expect(
      await run({
        _tag: 'Query',
        store: 'users',
        index: 'rank',
        range: { _tag: 'Only', key: 1 },
        limit: 1,
      }),
    ).toMatchObject({ records: [{ key: 1 }] });
    for (const limit of [0, -1, 1.5, Infinity, 2 ** 32])
      expect(await error({ _tag: 'Query', store: 'users', limit })).toMatchObject({
        _tag: 'IndexedDBInputError',
      });
    expect(await error({ _tag: 'Transaction', operations: [] })).toMatchObject({
      _tag: 'IndexedDBInputError',
    });
    expect(
      await error({ _tag: 'Query', store: 'users', index: 'missing', limit: 1 }),
    ).toMatchObject({ _tag: 'IndexedDBAccessError', phase: 'transaction', name: 'NotFoundError' });
  });

  it('decodes corrupted records after commit and retains committed writes on decode failure', async () => {
    const { options, run } = fixture();
    const corrupt = makeIndexedDBDriver(stores, { ...options, encode: () => ({ id: 1 }) });
    await corrupt.run(
      { _tag: 'Put', store: 'users', value: user(1) },
      { signal: new AbortController().signal, emit: () => undefined },
    );
    const cause = await run({
      _tag: 'Transaction',
      operations: [
        { _tag: 'Put', store: 'values', key: 'keep', value: true },
        { _tag: 'Read', store: 'users', key: 1 },
      ],
    }).catch((cause: unknown) => corrupt.toError?.(cause));
    expect(cause).toMatchObject({ _tag: 'IndexedDBDecodeError', store: 'users', committed: true });
    expect(await run({ _tag: 'Read', store: 'values', key: 'keep' })).toMatchObject({
      entry: { found: true, value: true },
    });
  });

  it('substitutes normally by name and infers record values from the store', async () => {
    const { driver } = fixture();
    type Msg = { readonly _tag: 'Got'; readonly result: IndexedDBOutput<typeof stores> };
    const Component = define<{ readonly name: string }, Msg>()('test-idb-fake', {
      init: () => ({ name: 'server' }),
      subscriptions: () => [
        command(
          driver,
          { _tag: 'Read', store: 'users', key: 1 },
          { onSuccess: (result) => ({ _tag: 'Got', result }) },
        ),
      ],
      update: {
        Got: (s, m) =>
          m.result._tag === 'Record' && m.result.store === 'users' && m.result.entry.found
            ? { name: m.result.entry.value.name }
            : s,
      },
      view: (s) => html`<output>${s.name}</output>`,
    });
    const fake = fakeDriver(driver);
    const el = new Component();
    el.drivers = { indexeddb: fake };
    document.body.append(el);
    await settled();
    expect(fake.inputs).toEqual([{ _tag: 'Read', store: 'users', key: 1 }]);
    fake.resolveNext({
      _tag: 'Record',
      store: 'users',
      key: 1,
      entry: { found: true, value: user(1) },
    });
    await vi.waitFor(() => {
      expect(el.state.name).toBe('User 1');
    });
    const typeAssertions = () => {
      // @ts-expect-error unknown stores are rejected
      const missing: IndexedDBInput<typeof stores> = { _tag: 'Read', store: 'missing', key: 1 };
      // @ts-expect-error records retain their schema's type
      const wrong: IndexedDBInput<typeof stores> = { _tag: 'Put', store: 'users', value: 'wrong' };
      return [missing, wrong];
    };
    expectTypeOf(typeAssertions).toBeFunction();
  });
});

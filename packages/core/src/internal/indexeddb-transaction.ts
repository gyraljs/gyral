import type {
  IndexedDBOperation,
  IndexedDBRange,
  IndexedDBResult,
  IndexedDBStores,
} from '../indexeddb-types.js';
import { databaseError } from './indexeddb-open.js';

export type RawResult = IndexedDBResult<IndexedDBStores>;
const rangeOf = (range: IndexedDBRange | undefined): IDBKeyRange | undefined => {
  if (range === undefined) return undefined;
  switch (range._tag) {
    case 'Only':
      return IDBKeyRange.only(range.key);
    case 'Lower':
      return IDBKeyRange.lowerBound(range.key, range.open);
    case 'Upper':
      return IDBKeyRange.upperBound(range.key, range.open);
    case 'Bound':
      return IDBKeyRange.bound(range.lower, range.upper, range.lowerOpen, range.upperOpen);
  }
};

/** Queue requests synchronously and resolve only from transaction complete. */
export function transact(
  db: IDBDatabase,
  operations: readonly IndexedDBOperation<IndexedDBStores>[],
  signal: AbortSignal,
): Promise<readonly RawResult[]> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const mode = operations.some((op) => op._tag === 'Put' || op._tag === 'Delete')
      ? 'readwrite'
      : 'readonly';
    const tx = db.transaction([...new Set(operations.map((op) => op.store))], mode);
    const state = { ended: false };
    const results: RawResult[] = [];
    const releaseRequests: (() => void)[] = [];
    let failure: unknown;
    const cleanup = (): void => {
      signal.removeEventListener('abort', abort);
      tx.oncomplete = null;
      tx.onabort = null;
      tx.onerror = null;
      for (const release of releaseRequests) release();
    };
    const end = (cause: unknown): void => {
      if (state.ended) return;
      state.ended = true;
      cleanup();
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve AbortSignal reasons
      reject(cause);
    };
    const stop = (): void => {
      try {
        tx.abort();
      } catch {
        /* A completed transaction cannot be undone. */
      }
    };
    const abort = (): void => {
      stop();
      end(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    tx.onerror = (event) => {
      if (event.target instanceof IDBRequest) failure = event.target.error;
    };
    tx.onabort = () => {
      end(
        databaseError(
          db.name,
          'transaction',
          failure ?? tx.error ?? new Error('Transaction aborted.'),
        ),
      );
    };
    tx.oncomplete = () => {
      if (state.ended) return;
      state.ended = true;
      cleanup();
      resolve(results);
    };
    try {
      operations.forEach((op, position) => {
        const store = tx.objectStore(op.store);
        if (op._tag === 'Read') {
          const request = store.openCursor(IDBKeyRange.only(op.key));
          releaseRequests.push(() => {
            request.onsuccess = null;
          });
          request.onsuccess = () => {
            const cursor = request.result;
            const value: unknown = cursor?.value;
            results[position] = {
              _tag: 'Record',
              store: op.store,
              key: op.key,
              entry: cursor === null ? { found: false } : { found: true, value },
            };
          };
        } else if (op._tag === 'Query') {
          const rows: { key: IDBValidKey; value: unknown }[] = [];
          results[position] = { _tag: 'Records', store: op.store, records: rows };
          const source = op.index === undefined ? store : store.index(op.index);
          const request = source.openCursor(rangeOf(op.range), op.direction);
          releaseRequests.push(() => {
            request.onsuccess = null;
          });
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null) return;
            const value: unknown = cursor.value;
            rows.push({ key: cursor.primaryKey, value });
            if (rows.length < op.limit) cursor.continue();
          };
        } else if (op._tag === 'Put') {
          const request = op.key === undefined ? store.put(op.value) : store.put(op.value, op.key);
          releaseRequests.push(() => {
            request.onsuccess = null;
          });
          request.onsuccess = () => {
            results[position] = { _tag: 'Put', store: op.store, key: request.result };
          };
        } else {
          const request = store.delete(op.key);
          releaseRequests.push(() => {
            request.onsuccess = null;
          });
          request.onsuccess = () => {
            results[position] = { _tag: 'Deleted', store: op.store, key: op.key };
          };
        }
      });
    } catch (cause) {
      stop();
      end(databaseError(db.name, 'transaction', cause));
    }
  });
}

import type { IndexedDBError, IndexedDBOptions, IndexedDBStores } from '../indexeddb-types.js';

export class DatabaseFailure extends Error {
  constructor(readonly error: IndexedDBError) {
    super(error._tag);
  }
}
export function databaseError(
  database: string,
  phase: 'encode' | 'open' | 'upgrade' | 'transaction',
  cause: unknown,
): DatabaseFailure {
  return new DatabaseFailure({
    _tag: 'IndexedDBAccessError',
    database,
    phase,
    name: cause instanceof Error ? cause.name : 'Error',
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

/** Native open requests cannot be cancelled: retain handlers to abort/close late results. */
export function openDatabase<S extends IndexedDBStores>(
  options: IndexedDBOptions<S>,
  signal: AbortSignal,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const factory =
      options.factory?.() ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
    if (factory === undefined) throw new Error('IndexedDB is unavailable.');
    signal.throwIfAborted();
    const request = factory.open(options.database, options.version);
    const state = { ended: false };
    const end = (cause: unknown): void => {
      if (state.ended) return;
      state.ended = true;
      signal.removeEventListener('abort', abort);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve AbortSignal reasons
      reject(cause);
    };
    const abort = (): void => {
      end(signal.reason);
      abortUpgrade();
    };
    const abortUpgrade = (): void => {
      try {
        request.transaction?.abort();
      } catch {
        /* Native abort may already be pending. */
      }
    };
    const cleanup = (): void => {
      request.onblocked = null;
      request.onupgradeneeded = null;
      request.onerror = null;
      request.onsuccess = null;
      signal.removeEventListener('abort', abort);
    };
    signal.addEventListener('abort', abort, { once: true });
    request.onblocked = () => {
      end(
        new DatabaseFailure({
          _tag: 'IndexedDBBlockedError',
          database: options.database,
          version: options.version,
        }),
      );
    };
    request.onupgradeneeded = (event) => {
      const transaction = request.transaction;
      if (transaction === null) return;
      if (state.ended) {
        abortUpgrade();
        return;
      }
      try {
        options.upgrade?.(
          request.result,
          event.oldVersion,
          event.newVersion ?? options.version,
          transaction,
        );
      } catch (cause) {
        end(databaseError(options.database, 'upgrade', cause));
        abortUpgrade();
      }
    };
    request.onerror = () => {
      end(databaseError(options.database, 'open', request.error));
      cleanup();
    };
    request.onsuccess = () => {
      const db = request.result;
      if (state.ended) db.close();
      else {
        state.ended = true;
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
      }
      cleanup();
    };
  });
}

import { afterEach, vi } from 'vitest';
import * as v from 'valibot';
import { makeIndexedDBDriver, type IndexedDBInput } from '../src/indexeddb.js';

export const stores = {
  users: v.object({ id: v.number(), name: v.string(), email: v.string(), rank: v.number() }),
  values: v.unknown(),
};
const databases = new Set<string>();
export const upgrade = (
  db: IDBDatabase,
  old: number,
  version: number,
  tx: IDBTransaction,
): void => {
  if (old < 1) {
    const users = db.createObjectStore('users', { keyPath: 'id' });
    users.createIndex('email', 'email', { unique: true });
    users.createIndex('rank', 'rank');
    db.createObjectStore('values');
  }
  if (old < 2 && version >= 2) tx.objectStore('users').createIndex('name', 'name');
};
export function fixture() {
  const database = `gyral-indexeddb-test-${crypto.randomUUID()}`;
  databases.add(database);
  const options = { database, version: 1, upgrade };
  const driver = makeIndexedDBDriver(stores, options);
  const run = (input: IndexedDBInput<typeof stores>, signal = new AbortController().signal) =>
    Promise.resolve(driver.run(input, { signal, emit: () => undefined }));
  const error = (input: IndexedDBInput<typeof stores>) =>
    run(input).catch((cause: unknown) => driver.toError?.(cause));
  return { database, options, driver, run, error };
}
export function connect(database: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, version);
    request.onupgradeneeded = (event) => {
      const tx = request.transaction;
      if (tx === null) throw new Error('Missing upgrade transaction.');
      upgrade(request.result, event.oldVersion, version, tx);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Open failed.'));
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}
export const user = (id: number, rank = id) => ({
  id,
  rank,
  name: `User ${String(id)}`,
  email: `${String(id)}@test.local`,
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const database of databases) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(database);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Delete failed.'));
      };
      request.onblocked = () => {
        reject(new Error('Driver leaked an IndexedDB connection.'));
      };
    });
  }
  databases.clear();
  document.body.replaceChildren();
});

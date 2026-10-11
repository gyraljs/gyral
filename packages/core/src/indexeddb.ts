// Optional native IndexedDB commands; native resources only exist while commands run (ADR 0028).
import type { Driver } from './command.js';
import type {
  IndexedDBError,
  IndexedDBInput,
  IndexedDBOptions,
  IndexedDBOperation,
  IndexedDBOutput,
  IndexedDBResult,
  IndexedDBStores,
} from './indexeddb-types.js';
import { DatabaseFailure, databaseError, openDatabase } from './internal/indexeddb-open.js';
import { transact, type RawResult } from './internal/indexeddb-transaction.js';
export type {
  IndexedDBError,
  IndexedDBInput,
  IndexedDBOperation,
  IndexedDBOptions,
  IndexedDBOutput,
  IndexedDBRange,
  IndexedDBRecord,
  IndexedDBResult,
  IndexedDBStores,
} from './indexeddb-types.js';

/** Typed record operations and atomic batches over application-owned stores and migrations. */
export function makeIndexedDBDriver<S extends IndexedDBStores>(
  stores: S,
  options: IndexedDBOptions<S>,
): Driver<IndexedDBInput<S>, IndexedDBOutput<S>, IndexedDBError> {
  const decode = async (store: string, value: unknown): Promise<unknown> => {
    const schema = stores[store];
    if (schema === undefined)
      throw new DatabaseFailure({
        _tag: 'IndexedDBInputError',
        message: `Unknown store ${store}.`,
      });
    try {
      const result = await schema['~standard'].validate(value);
      if (result.issues !== undefined)
        throw new DatabaseFailure({
          _tag: 'IndexedDBDecodeError',
          store,
          issues: result.issues,
          committed: true,
        });
      return result.value;
    } catch (cause) {
      if (cause instanceof DatabaseFailure) throw cause;
      throw new DatabaseFailure({
        _tag: 'IndexedDBDecodeError',
        store,
        committed: true,
        issues: [{ message: cause instanceof Error ? cause.message : String(cause) }],
      });
    }
  };
  const decodeResult = async (result: RawResult): Promise<IndexedDBResult<S>> => {
    let decoded: RawResult = result;
    if (result._tag === 'Record' && result.entry.found)
      decoded = {
        ...result,
        entry: { found: true, value: await decode(result.store, result.entry.value) },
      };
    else if (result._tag === 'Records')
      decoded = {
        ...result,
        records: await Promise.all(
          result.records.map(async (r) => ({
            key: r.key,
            value: await decode(result.store, r.value),
          })),
        ),
      };
    // The store name originates in the typed input, and each value passed that store's schema.
    return decoded;
  };
  return {
    name: options.name ?? 'indexeddb',
    concurrency: 'merge',
    toError: (cause) =>
      cause instanceof DatabaseFailure
        ? cause.error
        : databaseError(options.database, 'open', cause).error,
    run: async (input, ctx) => {
      ctx.signal.throwIfAborted();
      let phase: 'encode' | 'open' | 'transaction' = 'encode';
      try {
        const operations = input._tag === 'Transaction' ? input.operations : [input];
        if (operations.length === 0)
          throw new DatabaseFailure({
            _tag: 'IndexedDBInputError',
            message: 'Transactions require at least one operation.',
          });
        for (const op of operations) {
          if (stores[op.store] === undefined)
            throw new DatabaseFailure({
              _tag: 'IndexedDBInputError',
              message: `Unknown store ${op.store}.`,
            });
          if (
            op._tag === 'Query' &&
            (!Number.isInteger(op.limit) || op.limit < 1 || op.limit > 0xffffffff)
          )
            throw new DatabaseFailure({
              _tag: 'IndexedDBInputError',
              message: 'Query limit must be an integer from 1 to 2^32 - 1.',
            });
        }
        const encoded = operations.map((op): IndexedDBOperation<IndexedDBStores> => {
          if (op._tag !== 'Put' || options.encode === undefined) return op;
          return {
            _tag: 'Put',
            store: op.store,
            value: options.encode(op.store, op.value),
            ...(op.key === undefined ? {} : { key: op.key }),
          };
        });
        phase = 'open';
        const db = await openDatabase(options, ctx.signal);
        phase = 'transaction';
        let raw: readonly RawResult[];
        try {
          raw = await transact(db, encoded, ctx.signal);
        } finally {
          db.close();
        }
        const results = await Promise.all(raw.map(decodeResult));
        ctx.signal.throwIfAborted();
        if (input._tag === 'Transaction') return { _tag: 'Committed', results };
        const result = results[0];
        if (result === undefined) throw new Error('Missing transaction result.');
        return result;
      } catch (cause) {
        if (ctx.signal.aborted || cause instanceof DatabaseFailure) throw cause;
        throw databaseError(options.database, phase, cause);
      }
    },
  };
}

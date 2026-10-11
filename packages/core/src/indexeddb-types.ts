import type { StandardSchemaV1 } from '@standard-schema/spec';

export type IndexedDBStores = Readonly<Record<string, StandardSchemaV1>>;
export type IndexedDBRecord<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>;
export type IndexedDBRange =
  | { readonly _tag: 'Only'; readonly key: IDBValidKey }
  | { readonly _tag: 'Lower' | 'Upper'; readonly key: IDBValidKey; readonly open?: boolean }
  | {
      readonly _tag: 'Bound';
      readonly lower: IDBValidKey;
      readonly upper: IDBValidKey;
      readonly lowerOpen?: boolean;
      readonly upperOpen?: boolean;
    };
export type IndexedDBOperation<S extends IndexedDBStores> = {
  [K in keyof S & string]:
    | { readonly _tag: 'Read' | 'Delete'; readonly store: K; readonly key: IDBValidKey }
    | {
        readonly _tag: 'Put';
        readonly store: K;
        readonly value: IndexedDBRecord<S[K]>;
        readonly key?: IDBValidKey;
      }
    | {
        readonly _tag: 'Query';
        readonly store: K;
        readonly index?: string;
        readonly range?: IndexedDBRange;
        readonly direction?: IDBCursorDirection;
        readonly limit: number;
      };
}[keyof S & string];
export type IndexedDBInput<S extends IndexedDBStores> =
  | IndexedDBOperation<S>
  | { readonly _tag: 'Transaction'; readonly operations: readonly IndexedDBOperation<S>[] };
export type IndexedDBResult<S extends IndexedDBStores> = {
  [K in keyof S & string]:
    | {
        readonly _tag: 'Record';
        readonly store: K;
        readonly key: IDBValidKey;
        readonly entry:
          | { readonly found: false }
          | { readonly found: true; readonly value: IndexedDBRecord<S[K]> };
      }
    | { readonly _tag: 'Put' | 'Deleted'; readonly store: K; readonly key: IDBValidKey }
    | {
        readonly _tag: 'Records';
        readonly store: K;
        readonly records: readonly {
          readonly key: IDBValidKey;
          readonly value: IndexedDBRecord<S[K]>;
        }[];
      };
}[keyof S & string];
export type IndexedDBOutput<S extends IndexedDBStores> =
  | IndexedDBResult<S>
  | { readonly _tag: 'Committed'; readonly results: readonly IndexedDBResult<S>[] };
export type IndexedDBError =
  | { readonly _tag: 'IndexedDBBlockedError'; readonly database: string; readonly version: number }
  | { readonly _tag: 'IndexedDBInputError'; readonly message: string }
  | {
      readonly _tag: 'IndexedDBAccessError';
      readonly database: string;
      readonly phase: 'encode' | 'open' | 'upgrade' | 'transaction';
      readonly name: string;
      readonly message: string;
    }
  | {
      readonly _tag: 'IndexedDBDecodeError';
      readonly store: string;
      readonly issues: readonly StandardSchemaV1.Issue[];
      /** Native transaction completed before decoding. Its writes cannot be undone. */
      readonly committed: true;
    };
export interface IndexedDBOptions<S extends IndexedDBStores> {
  readonly database: string;
  readonly version: number;
  readonly name?: string;
  readonly factory?: () => IDBFactory;
  /** Synchronous: queue migration requests before returning; never await. */
  readonly upgrade?: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number,
    transaction: IDBTransaction,
  ) => void;
  readonly encode?: <K extends keyof S & string>(store: K, value: IndexedDBRecord<S[K]>) => unknown;
}

// Optional native Web Storage commands (ADR 0028). Never touches storage at import/factory time.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Driver } from './command.js';
import { subscription } from './subscription.js';

export type StorageInput<T> =
  | { readonly _tag: 'Read'; readonly key: string }
  | { readonly _tag: 'Write'; readonly key: string; readonly value: T }
  | { readonly _tag: 'Remove'; readonly key: string }
  | { readonly _tag: 'Clear' }
  | { readonly _tag: 'Watch'; readonly key: string };

/** Absence differs from a decoded value, even when the schema accepts null or undefined. */
export type StoredValue<T> =
  { readonly found: false } | { readonly found: true; readonly value: T };
export type StorageChangeSource = 'initial' | 'driver' | 'tab';
export interface StorageDecodeError {
  readonly _tag: 'StorageDecodeError';
  readonly key: string;
  readonly issues: readonly StandardSchemaV1.Issue[];
}
export type StorageError =
  | StorageDecodeError
  | {
      readonly _tag: 'StorageAccessError';
      readonly operation: StorageInput<unknown>['_tag'];
      readonly key: string | undefined;
      readonly message: string;
    };
export type StorageOutput<T> =
  | { readonly _tag: 'StorageValue'; readonly key: string; readonly entry: StoredValue<T> }
  | { readonly _tag: 'StorageWritten' | 'StorageRemoved'; readonly key: string }
  | { readonly _tag: 'StorageCleared' }
  | {
      readonly _tag: 'StorageChanged';
      readonly key: string;
      readonly source: StorageChangeSource;
      readonly entry: StoredValue<T>;
    }
  | {
      readonly _tag: 'StorageDecodeFailed';
      readonly key: string;
      readonly source: StorageChangeSource;
      readonly error: StorageDecodeError;
    };
export interface LocalStorageOptions<T> {
  /** Name for normal driver substitution. Default localStorage. */
  readonly name?: string;
  /** Keys and Clear are restricted to this namespace. Default empty (all keys). */
  readonly prefix?: string;
  /** Accessed only when a command runs. Default native localStorage. */
  readonly storage?: () => Storage;
  /** A transformed schema may need to encode model values back into its input shape. */
  readonly encode?: (value: T) => unknown;
}

interface Change {
  readonly key: string | null;
  readonly value: string | null;
}
const listeners = new WeakMap<Storage, Set<(change: Change) => void>>();
const notify = (storage: Storage, change: Change): void => {
  for (const listen of listeners.get(storage) ?? []) listen(change);
};
class StorageFailure extends Error {
  constructor(readonly error: StorageError) {
    super(error._tag);
  }
}
const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
const keyOf = (input: StorageInput<unknown>): string | undefined =>
  'key' in input ? input.key : undefined;

/** JSON storage with typed reads/writes and cancellable native + own-write change streams. */
export function makeLocalStorageDriver<T>(
  schema: StandardSchemaV1<unknown, T>,
  options: LocalStorageOptions<T> = {},
): Driver<StorageInput<T>, StorageOutput<T>, StorageError> {
  const name = options.name ?? 'localStorage';
  const prefix = options.prefix ?? '';
  const storageOf =
    options.storage ??
    (() => {
      if (typeof localStorage === 'undefined') throw new Error('localStorage is unavailable.');
      return localStorage;
    });
  const decode = async (raw: string | null, key: string): Promise<StoredValue<T>> => {
    if (raw === null) return { found: false };
    try {
      const value: unknown = JSON.parse(raw);
      const result = await schema['~standard'].validate(value);
      if (result.issues !== undefined)
        throw new StorageFailure({ _tag: 'StorageDecodeError', key, issues: result.issues });
      return { found: true, value: result.value };
    } catch (cause) {
      if (cause instanceof StorageFailure) throw cause;
      throw new StorageFailure({
        _tag: 'StorageDecodeError',
        key,
        issues: [{ message: messageOf(cause) }],
      });
    }
  };
  const watch = subscription<StorageOutput<T>, { readonly key: string }, StorageError>(
    name,
    (emit, { input, signal }) => {
      const storage = storageOf();
      const key = prefix + input.key;
      const initial = storage.getItem(key);
      let chain = Promise.resolve();
      // Re-read after each awaited decoder: cancellation can happen while it runs.
      const active = (): boolean => !signal.aborted;
      const publish = (raw: string | null, source: StorageChangeSource): void => {
        chain = chain.then(async () => {
          if (!active()) return;
          try {
            const entry = await decode(raw, input.key);
            if (active()) emit({ _tag: 'StorageChanged', key: input.key, source, entry });
          } catch (cause) {
            if (
              active() &&
              cause instanceof StorageFailure &&
              cause.error._tag === 'StorageDecodeError'
            ) {
              emit({ _tag: 'StorageDecodeFailed', key: input.key, source, error: cause.error });
            }
          }
        });
      };
      const own = (change: Change): void => {
        if (change.key === null || change.key === key) publish(change.value, 'driver');
      };
      const other = (event: StorageEvent): void => {
        if (event.storageArea === storage && (event.key === null || event.key === key))
          publish(event.newValue, 'tab');
      };
      const hub = listeners.get(storage) ?? new Set<(change: Change) => void>();
      listeners.set(storage, hub);
      hub.add(own);
      if (typeof window !== 'undefined') window.addEventListener('storage', other);
      publish(initial, 'initial');
      return () => {
        hub.delete(own);
        if (typeof window !== 'undefined') window.removeEventListener('storage', other);
      };
    },
  );
  return {
    name,
    concurrency: 'merge',
    toError: (cause) =>
      cause instanceof StorageFailure
        ? cause.error
        : {
            _tag: 'StorageAccessError',
            operation: 'Read',
            key: undefined,
            message: messageOf(cause),
          },
    run: async (input, ctx) => {
      ctx.signal.throwIfAborted();
      try {
        if (input._tag === 'Watch') return await watch.run(input, ctx);
        const storage = storageOf();
        if (input._tag === 'Clear') {
          if (prefix === '') {
            storage.clear();
            notify(storage, { key: null, value: null });
          } else {
            const keys: string[] = [];
            for (let i = 0; i < storage.length; i += 1) {
              const key = storage.key(i);
              if (key?.startsWith(prefix)) keys.push(key);
            }
            for (const key of keys) {
              storage.removeItem(key);
              notify(storage, { key, value: null });
            }
          }
          return { _tag: 'StorageCleared' };
        }
        const key = prefix + input.key;
        if (input._tag === 'Read') {
          const entry = await decode(storage.getItem(key), input.key);
          ctx.signal.throwIfAborted();
          return { _tag: 'StorageValue', key: input.key, entry };
        }
        if (input._tag === 'Write') {
          const value = JSON.stringify(
            options.encode === undefined ? input.value : options.encode(input.value),
          );
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- JSON.stringify(undefined) returns undefined despite its lib type
          if (value === undefined) throw new TypeError('Storage values must have a JSON encoding.');
          storage.setItem(key, value);
          notify(storage, { key, value });
          return { _tag: 'StorageWritten', key: input.key };
        }
        storage.removeItem(key);
        notify(storage, { key, value: null });
        return { _tag: 'StorageRemoved', key: input.key };
      } catch (cause) {
        if (ctx.signal.aborted || cause instanceof StorageFailure) throw cause;
        throw new StorageFailure({
          _tag: 'StorageAccessError',
          operation: input._tag,
          key: keyOf(input),
          message: messageOf(cause),
        });
      }
    },
  };
}

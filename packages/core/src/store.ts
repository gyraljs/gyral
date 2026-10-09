// Shared state: stores as "props from the side" (docs/design-docs/0013-shared-state.md).
// A store is MVI without a view: init + pure update, commands run by its own interpreter.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { DEVTOOLS_ENABLED, devCommands, devStore } from '#devtools';
import {
  splitNext,
  type AnyDriver,
  type Command,
  type DriverOverrides,
  type Next,
} from './command.js';
import { fail } from './errors.js';
import { features, type LocalHost } from './features.js';
import { makeInterpreter, type Interpreter } from './internal/interpreter.js';
import { noteActivity } from './scheduler.js';
import { bindStores } from './store-binding.js';
import type { IntentRejected, Tagged } from './types.js';
import { message } from './view/index.js';

/** No DOM means a server render: store commands never run there (ADR 0012). */
const onServer = typeof document === 'undefined';

type Variant<M extends Tagged, K extends M['_tag']> = Extract<M, { readonly _tag: K }>;

/** One pure reducer per message tag, like a component's `update` but without context. */
export type StoreUpdate<S, M extends Tagged> = {
  readonly [K in M['_tag']]: (state: S, msg: Variant<M, K>) => Next<S, M>;
};

export interface StoreSpec<S, M extends Tagged> {
  /** Initial state (and optional commands, e.g. load a saved cart). */
  readonly init: () => Next<S, M>;
  readonly update: StoreUpdate<S, M>;
  /** Driver substitutions by name for this store's commands. */
  readonly drivers?: DriverOverrides;
  /**
   * Validates the server's page seed before the client uses it (any synchronous Standard
   * Schema). An invalid seed is reported with console.error and the store starts from `init`.
   */
  readonly schema?: StandardSchemaV1<unknown, S>;
}

/** The result of checking a seed against a store's schema. */
export type SeedCheck<S> =
  | { readonly ok: true; readonly state: S }
  | { readonly ok: false; readonly issues: readonly string[] };

/** What `ctx.read()` accepts: anything that names a store and carries its state type. */
export interface StoreRef<S> {
  readonly name: string;
  /** Type-only marker for the state type. Never set at runtime. */
  readonly stateType?: (state: S) => S;
}

/** A live store: one per page on the client, one per request on the server, one per test. */
export interface StoreInstance<S, M extends Tagged> {
  readonly store: Store<S, M>;
  readonly state: S;
  /** Feeds a message through the store's `update` and notifies subscribers on change. */
  send(msg: M): void;
  /** Called after every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: S, prev: S) => void): () => void;
  /** Per-instance driver substitutions (test fakes). Checked before the spec's. */
  drivers: DriverOverrides;
  /** Stops running commands and drops subscribers. */
  dispose(): void;
  /** Set by the registry that holds the instance (store-to-store `send`). */
  bindScope(resolve: StoreResolver): void;
}

export interface Store<S, M extends Tagged> extends StoreRef<S> {
  readonly spec: StoreSpec<S, M>;
  /**
   * A fresh, independent instance. `initial` skips `init`'s state (a server seed, a test
   * fixture); `init`'s commands still run on the client.
   */
  instance(initial?: S): StoreInstance<S, M>;
  /** Checks a seed with `spec.schema` (ok as-is without one). */
  checkSeed(seed: unknown): SeedCheck<S>;
  /** Type-only marker for the message type. Never set at runtime. */
  readonly messageType?: (msg: M) => M;
}

/** Any store, with its types erased (for declarations and registries). */
export interface AnyStore {
  readonly name: string;
  instance(initial?: never): AnyStoreInstance;
  checkSeed(seed: unknown): SeedCheck<unknown>;
}

/** Any store instance, with its types erased. */
export interface AnyStoreInstance {
  readonly store: AnyStore;
  readonly state: unknown;
  send(msg: never): void;
  subscribe(listener: (state: unknown, prev: unknown) => void): () => void;
  dispose(): void;
  /**
   * Called by the registry that holds this instance, so the store's `send(other, msg)`
   * commands reach `other`'s instance in the same scope (gyral-czi.20).
   */
  bindScope?(resolve: StoreResolver): void;
}

/** Finds a store's instance in a scope (a registry). */
export type StoreResolver = (store: AnyStore) => AnyStoreInstance;

/** Store instances substituted by store name (tests, islands). */
export type StoreOverrides = Readonly<Record<string, AnyStoreInstance>>;

/** Defines a store. `name` keys it in registries, seeds and overrides, so keep it unique. */
export function defineStore<S, M extends Tagged>(name: string, spec: StoreSpec<S, M>): Store<S, M> {
  features.stores = bindStores; // components can use stores now (features.ts)
  const store: Store<S, M> = {
    name,
    spec,
    instance: (initial?: S) => createInstance(store, initial),
    checkSeed: (seed) => checkSeed(spec.schema, seed),
  };
  return store;
}

const issuePath = (issue: StandardSchemaV1.Issue): string =>
  (issue.path ?? []).map((s) => String(typeof s === 'object' ? s.key : s)).join('.');

function checkSeed<S>(
  schema: StandardSchemaV1<unknown, S> | undefined,
  seed: unknown,
): SeedCheck<S> {
  // Sound without a schema: the seed is this store's state, serialized by the server.
  if (schema === undefined) return { ok: true, state: seed as S };
  const result = schema['~standard'].validate(seed);
  if (result instanceof Promise) {
    return { ok: false, issues: ['the store schema is async; seeds need a synchronous schema'] };
  }
  if (result.issues === undefined) return { ok: true, state: result.value };
  return {
    ok: false,
    issues: result.issues.map((i) => `${issuePath(i) || '(root)'}: ${i.message}`),
  };
}

function createInstance<S, M extends Tagged>(
  store: Store<S, M>,
  initial: S | undefined,
): StoreInstance<S, M> {
  // Sound: send() only calls the reducer whose key equals msg._tag.
  const reducers = store.spec.update as unknown as Readonly<
    Record<string, ((state: S, msg: M) => Next<S, M>) | undefined>
  >;
  const listeners = new Set<(state: S, prev: S) => void>();
  let interpreter: Interpreter<M | IntentRejected> | undefined;
  let disposed = false;

  const [initState, initCommands] = splitNext(store.spec.init());
  let state = initial === undefined ? initState : initial;

  const resolve = (driver: AnyDriver): AnyDriver =>
    instance.drivers[driver.name] ?? store.spec.drivers?.[driver.name] ?? driver;

  let scope: StoreResolver | undefined;

  // Store-to-store writes: delivered synchronously to the other store's instance in scope.
  const deliver = ({ store: target, msg }: StoreSendInput): void => {
    if (scope === undefined) {
      console.warn(message(54, store.name, target.name));
      return;
    }
    (scope(target) as { send(msg: unknown): void }).send(msg);
  };

  const run = (commands: ReadonlyArray<Command<M | IntentRejected>>): void => {
    if (onServer || disposed || commands.length === 0) return; // never on the server (ADR 0012)
    for (const cmd of commands) {
      if (cmd.driver === STORE_SEND) {
        deliver(cmd.input as StoreSendInput);
        continue;
      }
      interpreter ??= makeInterpreter<M | IntentRejected>(
        resolve,
        (msg) => {
          // Stores have no IntentRejected reducer; only their own messages apply.
          if (msg._tag !== 'IntentRejected') instance.send(msg as M);
        },
        DEVTOOLS_ENABLED ? devCommands(() => `store:${store.name}`) : undefined,
        (cause, code, driver) => {
          const owner = `store "${store.name}"`;
          const text = code === 40 ? message(40, owner, driver) : message(41, owner, driver);
          fail(cause, 'command', text, { msg: driver });
        },
      );
      interpreter.run(cmd);
    }
  };

  const instance: StoreInstance<S, M> = {
    store,
    get state() {
      return state;
    },
    drivers: {},
    send(msg) {
      noteActivity(); // settled() keeps waiting while messages arrive (04)
      const reducer = reducers[msg._tag];
      if (reducer === undefined) {
        console.warn(message(55, store.name, msg._tag));
        return;
      }
      const prev = state;
      let result: Next<S, M>;
      try {
        result = reducer(prev, msg);
      } catch (cause) {
        // A store reducer that throws changes nothing (ADR 0024).
        fail(cause, 'store', message(76, store.name, msg._tag), { msg: msg._tag });
        return;
      }
      const [next, commands] = splitNext(result);
      state = next;
      if (DEVTOOLS_ENABLED) devStore(store.name, msg, prev, next);
      if (!Object.is(next, prev)) {
        // Each subscriber on its own: one that throws doesn't keep the others stale (ADR 0024).
        for (const listener of [...listeners]) {
          try {
            listener(next, prev);
          } catch (cause) {
            fail(cause, 'store', message(77, store.name), { msg: msg._tag });
          }
        }
      }
      run(commands);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      interpreter?.dispose();
      listeners.clear();
    },
    bindScope(resolver) {
      scope = resolver;
    },
  };

  // A seeded instance (hydration) starts init's commands after the hydrating renders flushed,
  // so a fast driver can't change state under them (same reason as ADR 0012 for components).
  if (initial === undefined) run(initCommands);
  else if (initCommands.length > 0)
    setTimeout(() => {
      run(initCommands);
    }, 0);
  return instance;
}

/** Marker driver for `send()`: `define()` delivers these to the resolved store instance. */
export const STORE_SEND = {
  name: '@gyral/store-send',
  run: () => undefined,
  /** A component's send: delivered to its instance of the store (features.ts). */
  local: (host: LocalHost, input: unknown) => {
    host.stores().send(input as StoreSendInput);
  },
} as const;

/** The input of a `send()` command. */
export interface StoreSendInput {
  readonly store: AnyStore;
  readonly msg: Tagged;
}

/** A command that sends `msg` to the component's instance of `store`. Writes are commands. */
// NoInfer: the store decides the message type, so a literal (`{ _tag: 'Track', … }`) is checked
// against it instead of widening `_tag` to string (store-to-store sends have no other context).
export function send<S, M extends Tagged>(store: Store<S, M>, msg: NoInfer<M>): Command<never> {
  const input: StoreSendInput = { store, msg };
  return { driver: STORE_SEND, input, onSuccess: () => undefined };
}

/** Framework message: a store this component reads changed (ADR 0013). Optional reducer. */
export interface StoreChanged {
  readonly _tag: 'StoreChanged';
  /** The store's name. Narrow with `changed(store, msg)`. */
  readonly store: string;
  readonly state: unknown;
  readonly prev: unknown;
}

/** Narrows a `StoreChanged` message to one store's typed state, or `undefined`. */
export function changed<S>(
  store: StoreRef<S>,
  msg: StoreChanged,
): { readonly state: S; readonly prev: S } | undefined {
  // Sound: the message was built from this store's instance (matched by unique name).
  return msg.store === store.name ? { state: msg.state as S, prev: msg.prev as S } : undefined;
}

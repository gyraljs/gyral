// A component's connection to the stores it declares (ADR 0013): resolve, read, subscribe, send.
import { scopeFor } from './store-scope.js';
import type {
  AnyStore,
  AnyStoreInstance,
  StoreOverrides,
  StoreRef,
  StoreSendInput,
} from './store.js';

type OnChange = (store: AnyStore, state: unknown, prev: unknown) => void;

export class StoreBinding {
  readonly #host: Element;
  readonly #tag: string;
  readonly #declared: ReadonlyMap<string, AnyStore>;
  readonly #overrides: () => StoreOverrides;
  readonly #onChange: OnChange;
  /** Resolved instances while connected (the scope can't change until it moves). */
  readonly #bound = new Map<string, AnyStoreInstance>();
  #unsubscribe: (() => void)[] = [];

  constructor(
    host: Element,
    tag: string,
    declared: readonly AnyStore[],
    overrides: () => StoreOverrides,
    onChange: OnChange,
  ) {
    this.#host = host;
    this.#tag = tag;
    this.#declared = new Map(declared.map((s) => [s.name, s]));
    this.#overrides = overrides;
    this.#onChange = onChange;
  }

  #instance(store: AnyStore): AnyStoreInstance {
    return (
      this.#bound.get(store.name) ??
      this.#overrides()[store.name] ??
      scopeFor(this.#host, this.#tag, store).get(store)
    );
  }

  #declaredStore(name: string): AnyStore {
    const store = this.#declared.get(name);
    if (store === undefined) {
      throw new Error(
        `<${this.#tag}> uses store "${name}" without declaring it. Add it to the spec: ` +
          `stores: [${name}] (ADR 0013), so the component subscribes to its changes.`,
      );
    }
    return store;
  }

  /** `ctx.read(store)`: the current state of this component's instance of `store`. */
  read<S>(ref: StoreRef<S>): S {
    // Sound: instances are keyed by store name, and the ref carries that store's state type.
    return this.#instance(this.#declaredStore(ref.name)).state as S;
  }

  /** Delivers a `send(store, msg)` command to this component's instance of the store. */
  send(input: StoreSendInput): void {
    const store = this.#declaredStore(input.store.name);
    (this.#instance(store) as { send(msg: unknown): void }).send(input.msg);
  }

  /** Resolves and subscribes every declared store. Returns true if any instance changed. */
  connect(): boolean {
    this.disconnect();
    let rebound = false;
    for (const store of this.#declared.values()) {
      const instance = this.#instance(store);
      this.#bound.set(store.name, instance);
      this.#unsubscribe.push(
        instance.subscribe((state, prev) => {
          this.#onChange(store, state, prev);
        }),
      );
      rebound = true;
    }
    return rebound;
  }

  disconnect(): void {
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#unsubscribe = [];
    this.#bound.clear();
  }
}

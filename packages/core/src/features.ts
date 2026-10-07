// Features that register themselves when their API is used (ADR 0018 "Size", gyral-g1r.18).
// Core reaches them only through these slots, which the feature's own API fills when called:
// `command()` the interpreter, `defineStore()` the store binding, a prop builder the prop
// machinery. An app that never calls one doesn't bundle what it registers. No module does this
// at load time: bundlers keep `sideEffects: false` and tree-shake as usual.
import type { DriverOverrides } from './command.js';
import type { Interpreter } from './internal/interpreter.js';
import type { PropFeature } from './props.js';
import type { AnyStore, StoreOverrides, StoreRef, StoreSendInput } from './store.js';
import type { CommandTrace } from './devtools-events.js';
import type { IntentRejected, Tagged } from './types.js';

/** A host's element, as features see it. */
export type FeatureHost = HTMLElement & { drivers: DriverOverrides; stores: StoreOverrides };

/** What a component's store binding offers its model (store-binding.ts). */
export interface StoreLink {
  read<S>(ref: StoreRef<S>): S;
  send(input: StoreSendInput): void;
  connect(): boolean;
  disconnect(): void;
}

/** The host a marker driver's `local` handler runs against (focus, emit, store send). */
export interface LocalHost {
  readonly el: FeatureHost;
  readonly tag: string;
  readonly root: () => ParentNode | undefined;
  readonly stores: () => StoreLink;
}

/** A marker driver core runs itself, synchronously, without the interpreter. */
export interface LocalDriver {
  readonly local: (host: LocalHost, input: unknown) => void;
}

type Msg = Tagged | IntentRejected;

export const features: {
  /** Set by `command()`: a host's command interpreter, resolving drivers by name (ADR 0006). */
  commands?: (
    el: FeatureHost,
    drivers: DriverOverrides | undefined,
    dispatch: (msg: Msg) => void,
    trace: CommandTrace | undefined,
  ) => Interpreter<Msg>;
  /** Set by `defineStore()`: binds a host to the stores it declares (ADR 0013). */
  stores?: (
    el: FeatureHost,
    tag: string,
    declared: readonly AnyStore[],
    onChange: (store: AnyStore, state: unknown, prev: unknown) => void,
  ) => StoreLink;
  /** Set by the prop builders: attribute parsing and validation (view/05 "Props"). */
  props?: PropFeature;
} = {};

// The model side of one Gyral host (docs/design-docs/view/05-element.md, ADR 0006, ADR 0013):
// state, reducers and commands. element.ts owns the DOM side (props, root, lifecycle,
// rendering) and asks this object for state and context. Reducers run at once, so `state` is
// always current; only the render waits (04). The interpreter and the store binding come from
// features.ts, registered by `command()` and `defineStore()`; marker drivers (focus, emit, store
// sends) carry their own `local` handler.
import { DEVTOOLS_ENABLED, devCommands, devOwner, devUpdate } from '#devtools';
import { splitNext, type Command, type Next } from './command.js';
import {
  features,
  type FeatureHost,
  type LocalDriver,
  type LocalHost,
  type StoreLink,
} from './features.js';
import type { Seed } from './hydration.js';
import { runInit } from './init.js';
import type { Interpreter } from './internal/interpreter.js';
import { requestTransition } from './scheduler.js';
import type { AnyStore } from './store.js';
import type { ComponentSpec, Ctx, IntentRejected, Tagged } from './types.js';

type Bag = Readonly<Record<string, unknown>>;
type Reducer<S> = (state: S, msg: Tagged, ctx: Ctx<object>) => Next<S, Tagged>;
/** A command as the model runs it. */
export type ModelCommand = Command<Tagged | IntentRejected>;
type Cmd = ModelCommand;

/** What the model needs from its element. */
export interface ModelHost {
  readonly el: FeatureHost;
  readonly tag: string;
  /** The declared props as components see them (defaults applied). */
  readonly props: () => Bag;
  /** The host's root once it has one (focus commands run against it). */
  readonly root: () => ParentNode | undefined;
  /** Something changed that the next render must show; `onFrame`: in the frame lane (04). */
  readonly invalidate: (onFrame: boolean) => void;
}

export class HostModel<S, P> implements LocalHost {
  readonly #host: ModelHost;
  readonly #spec: ComponentSpec<S, Tagged, P>;
  readonly #reducers: Readonly<Record<string, Reducer<S> | undefined>>;
  #binding: StoreLink | undefined;
  #model: { value: S } | undefined;
  /** Props as of init or the last PropsChanged: the `prev` of the next PropsChanged. */
  #seen: Bag | undefined;
  #interpreter: Interpreter<Tagged | IntentRejected> | undefined;
  /** Commands kept while disconnected (init's, before the first connect); undefined once connected. */
  #pending: Cmd[] | undefined = [];

  constructor(host: ModelHost, spec: ComponentSpec<S, Tagged, P>) {
    this.#host = host;
    this.#spec = spec;
    // Sound: dispatch() only calls the reducer whose key equals msg._tag.
    this.#reducers = spec.update as unknown as Readonly<Record<string, Reducer<S> | undefined>>;
  }

  get el(): FeatureHost {
    return this.#host.el;
  }

  get tag(): string {
    return this.#host.tag;
  }

  readonly root = (): ParentNode | undefined => this.#host.root();

  /** The store binding, created on first use. Only reached once `defineStore()` has run. */
  readonly stores = (): StoreLink =>
    (this.#binding ??= (features.stores as NonNullable<typeof features.stores>)(
      this.#host.el,
      this.#host.tag,
      this.#spec.stores ?? [],
      (store, state, prev) => {
        this.#storeChanged(store, state, prev);
      },
    ));

  get ready(): boolean {
    return this.#model !== undefined;
  }

  /** The current state, running `init` (and `initialMessages`) on first read. */
  state(initialMessages: readonly Tagged[] = []): S {
    if (this.#model === undefined) {
      this.#seen = this.#host.props();
      this.apply(runInit(this.#spec, this.#seen as P));
      for (const msg of initialMessages) this.dispatch(msg, false);
    }
    return (this.#model as { value: S }).value;
  }

  hasReducer(tag: string): boolean {
    return this.#reducers[tag] !== undefined;
  }

  /**
   * Resumes from a server seed (ADR 0012): the server's state, or `init(props)`'s when the
   * seed left it out. Returns init's commands, to start after the first render.
   */
  resume(seed: Seed): readonly Cmd[] {
    this.#seen = this.#host.props();
    const [initial, commands] = splitNext(runInit(this.#spec, this.#seen as P));
    // Sound: the seed is this component's own state, written by the server.
    this.#model = { value: 'state' in seed ? (seed.state as S) : initial };
    return commands;
  }

  /** PropsChanged when props differ from the last ones seen (`Object.is` per prop). */
  syncProps(names: readonly string[]): void {
    const prev = this.#seen;
    if (prev === undefined) return;
    const props = this.#host.props();
    if (names.every((name) => Object.is(props[name], prev[name]))) return;
    this.#seen = props;
    this.dispatch({ _tag: 'PropsChanged', props, prev } as Tagged, false);
  }

  dispatch(msg: Tagged, schedule = true): void {
    const reducer = this.#reducers[msg._tag];
    if (reducer === undefined) {
      // Framework messages have optional reducers; props and stores stay readable as context.
      if (msg._tag !== 'PropsChanged' && msg._tag !== 'StoreChanged') {
        console.warn(`<${this.#host.tag}> has no update for message "${msg._tag}".`);
      }
      return;
    }
    const prev = this.state();
    this.apply(reducer(prev, msg, this.ctx() as Ctx<object>));
    const next = this.state();
    if (DEVTOOLS_ENABLED) devUpdate(this.#host.el, this.#host.tag, msg, prev, next);
    if (!schedule) return;
    if (this.#spec.viewTransition?.(prev, next, msg) === true) requestTransition();
    this.#host.invalidate(this.#onFrame(msg._tag));
  }

  apply(next: Next<S, Tagged> | Next<S, Tagged | IntentRejected>): void {
    const [state, commands] = splitNext(next as Next<S, Tagged>);
    this.#model = { value: state };
    for (const cmd of commands as readonly Cmd[]) {
      const local = (cmd.driver as Partial<LocalDriver>).local;
      if (local !== undefined) local(this, cmd.input);
      else if (this.#pending !== undefined) this.#pending.push(cmd);
      else this.#commands().run(cmd);
    }
  }

  /** Starts commands kept for later (init's, after a server-rendered host's first render). */
  run(commands: readonly Cmd[]): void {
    this.apply([this.state(), commands]);
  }

  ctx(): Ctx<P> {
    return { props: this.#host.props() as P, read: (store) => this.stores().read(store) };
  }

  /** Resolves stores and runs kept commands. Returns true if store instances were bound. */
  connect(): boolean {
    // The nearest <gyral-stores> may differ after a move.
    const rebound = (this.#spec.stores?.length ?? 0) > 0 && this.stores().connect();
    const pending = this.#pending ?? [];
    this.#pending = undefined;
    for (const cmd of pending) this.#commands().run(cmd);
    return rebound;
  }

  disconnect(): void {
    this.#binding?.disconnect();
    this.#interpreter?.dispose();
    this.#interpreter = undefined;
    this.#pending ??= [];
  }

  /**
   * The interpreter, started with the first command after connecting. Only reached for a
   * command built by `command()`, which registered it (features.ts).
   */
  #commands(): Interpreter<Tagged | IntentRejected> {
    const { el, tag } = this.#host;
    return (this.#interpreter ??= (features.commands as NonNullable<typeof features.commands>)(
      el,
      this.#spec.drivers,
      (msg) => {
        this.dispatch(msg);
      },
      DEVTOOLS_ENABLED ? devCommands(() => devOwner(el, tag)) : undefined,
    ));
  }

  /** Does `tag` render in the frame lane (`spec.renderOnFrame`)? */
  #onFrame(tag: string): boolean {
    return this.#spec.renderOnFrame?.includes(tag) === true;
  }

  #storeChanged(store: AnyStore, state: unknown, prev: unknown): void {
    if (this.#reducers['StoreChanged'] !== undefined) {
      this.dispatch({ _tag: 'StoreChanged', store: store.name, state, prev } as Tagged);
    } else {
      this.#host.invalidate(this.#onFrame('StoreChanged'));
    }
  }
}

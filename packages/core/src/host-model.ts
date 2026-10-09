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
import { fail, type ErrorPhase, type GyralError } from './errors.js';
import type { Seed } from './hydration.js';
import { runInit } from './init.js';
import type { Interpreter } from './internal/interpreter.js';
import { noteActivity, requestTransition } from './scheduler.js';
import type { AnyStore } from './store.js';
import type { ComponentSpec, Ctx, IntentRejected, ParserCtx, Tagged } from './types.js';
import { message } from './view/index.js';

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
  readonly el: FeatureHost;
  readonly tag: string;
  readonly root: () => ParentNode | undefined;
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
  /** Connected to the document (a pending stop checks it, so a move cancels the stop). */
  #on = false;
  /** Commands were stopped while detached: the next connect sends `Connected`. */
  #stopped = false;
  /** `init` threw (ADR 0024): the host shows its error view, or stays empty. */
  #failure: GyralError | undefined;
  /** Handling `Errored`: a failure now is reported, never sent again (no loops). */
  #erroring = false;

  constructor(host: ModelHost, spec: ComponentSpec<S, Tagged, P>) {
    this.#host = host;
    this.el = host.el;
    this.tag = host.tag;
    this.root = host.root;
    this.#spec = spec;
    // Sound: dispatch() only calls the reducer whose key equals msg._tag.
    this.#reducers = spec.update as unknown as Readonly<Record<string, Reducer<S> | undefined>>;
  }

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

  /** Set when `init` threw; the host has no state then. */
  get failure(): GyralError | undefined {
    return this.#failure;
  }

  /** The current state, running `init` (and `initialMessages`) on first read. */
  state(initialMessages: readonly Tagged[] = []): S {
    if (this.#model === undefined) {
      this.#seen = this.#host.props();
      const next = this.#init();
      if (next === undefined) return undefined as S; // init threw: `failure` says so
      this.apply(next);
      for (const msg of initialMessages) this.dispatch(msg, false);
    }
    return (this.#model as { value: S }).value;
  }

  /** `init(props)`, or undefined after reporting its failure (ADR 0024). */
  #init(): Next<S, Tagged> | undefined {
    try {
      return runInit(this.#spec, this.#seen as P);
    } catch (cause) {
      this.#failure = this.fail(cause, 'init', message(74, this.tag));
      this.#model = { value: undefined as S };
      return undefined;
    }
  }

  /**
   * Reports a failure of this host (ADR 0024) and, for a failed update, parse or command, sends
   * `Errored` to its optional reducer. A failure while handling `Errored` is only reported.
   */
  fail(cause: unknown, phase: ErrorPhase, text: string, msg?: string): GyralError {
    const error = fail(cause, phase, text, { host: this.el, tag: this.tag, msg });
    if (
      !this.#erroring &&
      (phase === 'update' || phase === 'parse' || phase === 'command') &&
      this.#reducers['Errored'] !== undefined
    ) {
      this.#erroring = true;
      try {
        this.dispatch({ _tag: 'Errored', phase, error } as Tagged);
      } finally {
        this.#erroring = false;
      }
    }
    return error;
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
    const next = this.#init();
    if (next === undefined) return [];
    const [initial, commands] = splitNext(next);
    // Sound: the seed is this component's own state, written by the server.
    this.#model = { value: 'state' in seed ? (seed.state as S) : initial };
    return commands;
  }

  /**
   * PropsChanged when props differ from the last ones seen (`Object.is` per prop). A reducer
   * that throws leaves them unseen, so the next render sends PropsChanged again (ADR 0024).
   */
  syncProps(names: readonly string[]): void {
    const prev = this.#seen;
    if (prev === undefined || this.#failure !== undefined) return;
    const props = this.#host.props();
    if (names.every((name) => Object.is(props[name], prev[name]))) return;
    if (this.dispatch({ _tag: 'PropsChanged', props, prev } as Tagged, false)) this.#seen = props;
  }

  /**
   * Runs `msg`'s reducer. A reducer that throws changes nothing (no state, no commands): the
   * failure is reported (ADR 0024) and dispatch returns false.
   */
  dispatch(msg: Tagged, schedule = true): boolean {
    noteActivity(); // settled() keeps waiting while messages arrive (04)
    const reducer = this.#reducers[msg._tag];
    if (reducer === undefined) {
      // Framework messages have optional reducers; props and stores stay readable as context.
      if (msg._tag !== 'PropsChanged' && msg._tag !== 'StoreChanged' && msg._tag !== 'Errored') {
        console.warn(message(10, this.#host.tag, msg._tag));
      }
      return true;
    }
    if (this.#failure !== undefined) return false;
    const prev = this.state();
    let next: Next<S, Tagged>;
    try {
      next = reducer(prev, msg, this.ctx() as Ctx<object>);
    } catch (cause) {
      this.fail(cause, 'update', message(73, this.tag, msg._tag), msg._tag);
      return false;
    }
    this.apply(next);
    const state = this.state();
    if (DEVTOOLS_ENABLED) devUpdate(this.#host.el, this.#host.tag, msg, prev, state);
    if (!schedule) return true;
    if (this.#spec.viewTransition?.(prev, state, msg) === true) requestTransition();
    this.#host.invalidate(this.#onFrame(msg._tag));
    return true;
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

  // Reducers and the view get this too; only parsers' type (ParserCtx) names `state`.
  ctx(): ParserCtx<P, S> {
    return {
      props: this.#host.props() as P,
      read: (store) => this.stores().read(store),
      state: this.state(),
    };
  }

  /**
   * Resolves stores and runs kept commands; after a real detach, sends `Connected` (05
   * "Lifecycle"). Returns true if store instances were bound.
   */
  connect(): boolean {
    this.#on = true; // a move: the pending stop finds the host connected and does nothing
    // The nearest <gyral-stores> may differ after a move.
    const rebound = (this.#spec.stores?.length ?? 0) > 0 && this.stores().connect();
    const pending = this.#pending ?? [];
    this.#pending = undefined;
    for (const cmd of pending) this.#commands().run(cmd);
    if (this.#stopped) {
      this.#stopped = false;
      if (this.#reducers['Connected'] !== undefined) {
        this.dispatch({ _tag: 'Connected', reconnect: true } as Tagged);
      }
    }
    return rebound;
  }

  /**
   * Stops the commands one microtask later, unless the host is connected again first: a move
   * (`appendChild`, `insertBefore`) disconnects and connects in one task and keeps them running.
   */
  disconnect(): void {
    this.#binding?.disconnect();
    this.#pending ??= [];
    this.#on = false;
    queueMicrotask(() => {
      if (this.#on) return;
      this.#interpreter?.dispose();
      this.#interpreter = undefined;
      this.#stopped = true;
    });
  }

  /**
   * The interpreter, started with the first command after connecting. Only reached for a
   * command built by `command()`, which registered it (features.ts).
   */
  #commands(): Interpreter<Tagged | IntentRejected> {
    const el = this.el;
    return (this.#interpreter ??= (features.commands as NonNullable<typeof features.commands>)(
      el,
      this.#spec.drivers,
      (msg) => {
        this.dispatch(msg);
      },
      DEVTOOLS_ENABLED ? devCommands(() => devOwner(el, this.tag)) : undefined,
      (cause, code, driver) => {
        const owner = `<${this.tag}>`;
        const text = code === 40 ? message(40, owner, driver) : message(41, owner, driver);
        this.fail(cause, 'command', text, driver);
      },
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

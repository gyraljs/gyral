// The model side of one Gyral host (docs/design-docs/view/05-element.md, ADR 0006, ADR 0013):
// state, reducers, commands, the interpreter and the store binding. element.ts owns the DOM
// side (props, root, lifecycle, rendering) and asks this object for state and context.
// Reducers run at once, so `state` is always current; only the render waits (04).
import { DEVTOOLS_ENABLED, devCommands, devOwner, devUpdate } from '#devtools';
import { dispatchOutput, EMIT } from './children.js';
import {
  splitNext,
  type AnyDriver,
  type Command,
  type DriverOverrides,
  type Next,
} from './command.js';
import { providedDriver } from './drivers-scope.js';
import { FOCUS, queueFocus, type FocusInput } from './focus.js';
import type { Seed } from './hydration.js';
import { runInit } from './init.js';
import { makeInterpreter, type Interpreter } from './internal/interpreter.js';
import { requestTransition } from './scheduler.js';
import { StoreBinding } from './store-binding.js';
import { STORE_SEND, type AnyStore, type StoreOverrides, type StoreSendInput } from './store.js';
import type { ComponentSpec, Ctx, IntentRejected, Tagged } from './types.js';

type Bag = Readonly<Record<string, unknown>>;
type Reducer<S> = (state: S, msg: Tagged, ctx: Ctx<object>) => Next<S, Tagged>;
/** A command as the model runs it. */
export type ModelCommand = Command<Tagged | IntentRejected>;
type Cmd = ModelCommand;

/** What the model needs from its element. */
export interface ModelHost {
  readonly el: HTMLElement & { drivers: DriverOverrides; stores: StoreOverrides };
  readonly tag: string;
  /** The declared props as components see them (defaults applied). */
  readonly props: () => Bag;
  /** The host's root once it has one (focus commands run against it). */
  readonly root: () => ParentNode | undefined;
  /** Something changed that the next render must show; `onFrame`: in the frame lane (04). */
  readonly invalidate: (onFrame: boolean) => void;
}

export class HostModel<S, P> {
  readonly #host: ModelHost;
  readonly #spec: ComponentSpec<S, Tagged, P>;
  readonly #reducers: Readonly<Record<string, Reducer<S> | undefined>>;
  readonly #binding: StoreBinding;
  #model: { value: S } | undefined;
  /** Props as of init or the last PropsChanged: the `prev` of the next PropsChanged. */
  #seen: Bag | undefined;
  #interpreter: Interpreter<Tagged | IntentRejected> | undefined;
  #pending: Cmd[] = [];

  constructor(host: ModelHost, spec: ComponentSpec<S, Tagged, P>) {
    this.#host = host;
    this.#spec = spec;
    // Sound: dispatch() only calls the reducer whose key equals msg._tag.
    this.#reducers = spec.update as unknown as Readonly<Record<string, Reducer<S> | undefined>>;
    this.#binding = new StoreBinding(
      host.el,
      host.tag,
      spec.stores ?? [],
      () => host.el.stores,
      (store, state, prev) => {
        this.#storeChanged(store, state, prev);
      },
    );
  }

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
    const { el, tag } = this.#host;
    for (const cmd of commands as readonly Cmd[]) {
      if (cmd.driver === EMIT) dispatchOutput(el, cmd.input);
      else if (cmd.driver === STORE_SEND) this.#binding.send(cmd.input as StoreSendInput);
      else if (cmd.driver === FOCUS) queueFocus(el, this.#host.root, tag, cmd.input as FocusInput);
      else if (this.#interpreter === undefined) this.#pending.push(cmd);
      else this.#interpreter.run(cmd);
    }
  }

  /** Starts commands kept for later (init's, after a server-rendered host's first render). */
  run(commands: readonly Cmd[]): void {
    this.apply([this.state(), commands]);
  }

  ctx(): Ctx<P> {
    return { props: this.#host.props() as P, read: (store) => this.#binding.read(store) };
  }

  /** Resolves stores and starts the interpreter. Returns true if store instances were bound. */
  connect(): boolean {
    const { el, tag } = this.#host;
    const rebound = this.#binding.connect(); // the nearest <gyral-stores> may differ after a move
    this.#interpreter = makeInterpreter<Tagged | IntentRejected>(
      this.#resolve,
      (msg) => {
        this.dispatch(msg);
      },
      DEVTOOLS_ENABLED ? devCommands(() => devOwner(el, tag)) : undefined,
    );
    const pending = this.#pending;
    this.#pending = [];
    for (const cmd of pending) this.#interpreter.run(cmd);
    return rebound;
  }

  disconnect(): void {
    this.#binding.disconnect();
    this.#interpreter?.dispose();
    this.#interpreter = undefined;
  }

  /** Does `tag` render in the frame lane (`spec.renderOnFrame`)? */
  #onFrame(tag: string): boolean {
    return this.#spec.renderOnFrame?.includes(tag) === true;
  }

  // el.drivers → nearest provider → spec.drivers → the command's own (gyral-czi.35).
  #resolve = (driver: AnyDriver): AnyDriver =>
    this.#host.el.drivers[driver.name] ??
    providedDriver(this.#host.el, driver.name) ??
    this.#spec.drivers?.[driver.name] ??
    driver;

  #storeChanged(store: AnyStore, state: unknown, prev: unknown): void {
    if (this.#reducers['StoreChanged'] !== undefined) {
      this.dispatch({ _tag: 'StoreChanged', store: store.name, state, prev } as Tagged);
    } else {
      this.#host.invalidate(this.#onFrame('StoreChanged'));
    }
  }
}

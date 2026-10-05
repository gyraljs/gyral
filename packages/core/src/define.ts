import { isServer, LitElement } from 'lit';
import {
  splitNext,
  type AnyDriver,
  type Command,
  type DriverOverrides,
  type Next,
} from './command.js';
import { dispatchOutput, EMIT } from './children.js';
import type { GyralElement, GyralElementClass } from './element-types.js';
import { takeSeed, writeSeed } from './hydration.js';
import { runInit } from './init.js';
import { handleIntent, intentNames, listenForIntents } from './intent.js';
import { makeInterpreter, type Interpreter } from './internal/interpreter.js';
import { readProps, restoreProps, sameProps } from './props.js';
import { attachStates, type StateSync } from './states.js';
import { STORE_SEND, type AnyStore, type StoreOverrides, type StoreSendInput } from './store.js';
import { StoreBinding } from './store-binding.js';
import { withViewTransition } from './transitions.js';
import type {
  ComponentSpec,
  Ctx,
  IntentNames,
  IntentParser,
  IntentRejected,
  Tagged,
} from './types.js';

export type { GyralElement, GyralElementClass } from './element-types.js';

// Lit types `isServer` per build condition; widen it so both branches type-check (ADR 0012).
const onServer: boolean = isServer;

/**
 * Compiles a Model-View-Intent spec into a custom element and registers it under `tag`.
 * See docs/design-docs/0001-mvi-parsed-intent.md, 0006-effects-and-drivers.md, 0007-props.md
 * 0008-forms.md and 0012-ssr.md.
 */
export function define<S, M extends Tagged, P extends object = object, O extends Tagged = never>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): GyralElementClass<S, M, P, O> {
  const propNames = Object.keys(spec.props ?? {});
  const parsers = spec.intent as Readonly<Record<string, IntentParser<M> | undefined>>;
  // Sound: #dispatch() only calls the reducer whose key equals msg._tag.
  const reducers = spec.update as unknown as Readonly<
    Record<string, ((state: S, msg: Tagged, ctx: Ctx<P>) => Next<S, M>) | undefined>
  >;

  class Element extends LitElement implements GyralElement<S, M> {
    static override properties = spec.props ?? {};
    static override styles = spec.styles ?? [];
    static readonly spec = spec;
    static readonly tagName = tag;

    drivers: DriverOverrides = {};
    stores: StoreOverrides = {};
    initialMessages: readonly Tagged[] = [];

    /** Reads, subscriptions and writes for spec.stores (ADR 0013). */
    #binding = new StoreBinding(
      this,
      tag,
      spec.stores ?? [],
      () => this.stores,
      (store, state, prev) => {
        this.#storeChanged(store, state, prev);
      },
    );
    #model: { value: S } | undefined;
    /** Props as of the last init or PropsChanged; the `prev` of the next PropsChanged. */
    #seenProps: P | undefined;
    #listening = false;
    #interpreter: Interpreter<M | IntentRejected> | undefined;
    #pending: Command<M | IntentRejected>[] = [];
    /** init's commands on the hydration path; started in firstUpdated (ADR 0012). */
    #afterHydration: readonly Command<M | IntentRejected>[] = [];
    /** The latest view-transition update, awaited by updateComplete. */
    #transition: Promise<void> | undefined;
    /** Mirrors spec.states onto CSS custom states; only attached when the spec asks. */
    #syncStates: StateSync | undefined =
      spec.states === undefined || onServer ? undefined : attachStates(this);

    get state(): S {
      if (this.#model === undefined) {
        this.#seenProps = this.#props();
        this.#apply(runInit(spec, this.#seenProps));
        for (const msg of this.initialMessages) this.#dispatch(msg, false);
      }
      return (this.#model as { value: S }).value;
    }

    send(msg: M): void {
      this.#dispatch(msg);
    }

    #dispatch(msg: Tagged, render = true): void {
      const reducer = reducers[msg._tag];
      if (reducer === undefined) {
        // Framework messages have optional reducers; props and stores stay readable as context.
        if (msg._tag !== 'PropsChanged' && msg._tag !== 'StoreChanged') {
          console.warn(`<${tag}> has no update for message "${msg._tag}".`);
        }
        return;
      }
      const prev = this.state;
      this.#apply(reducer(prev, msg, this.#ctx()));
      if (!render) return;
      if (spec.viewTransition?.(prev, this.state, msg) === true) {
        // The DOM change happens inside the transition callback (ADR 0001 addendum);
        // updateComplete waits for it, so tests and callers see the new DOM.
        this.#transition = withViewTransition(async () => {
          this.requestUpdate();
          await super.getUpdateComplete();
        }).catch((error: unknown) => {
          console.error(`<${tag}> view transition update failed`, error);
        });
      } else {
        this.requestUpdate();
      }
    }

    protected override async getUpdateComplete(): Promise<boolean> {
      await this.#transition;
      return super.getUpdateComplete();
    }

    override connectedCallback(): void {
      this.#resumeFromSeed();
      super.connectedCallback();
      // Re-resolve on every connect: the nearest <gyral-stores> may differ after a move.
      if (this.#binding.connect()) this.requestUpdate();
      this.#interpreter = makeInterpreter<M | IntentRejected>(this.#resolve, (msg) => {
        this.#dispatch(msg);
      });
      const pending = this.#pending;
      this.#pending = [];
      for (const cmd of pending) this.#interpreter.run(cmd);
      if (this.#listening) return;
      listenForIntents(this.renderRoot, spec.events ?? [], this.#onEvent);
      this.#listening = true;
    }

    override disconnectedCallback(): void {
      super.disconnectedCallback();
      this.#binding.disconnect();
      this.#interpreter?.dispose();
      this.#interpreter = undefined;
    }

    protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
      super.willUpdate(changed);
      if (onServer) {
        // Server renders run constructor, willUpdate and render only (ADR 0012).
        writeSeed(this, this.state, this.#props() as Record<string, unknown>, spec.props ?? {});
        return;
      }
      const prev = this.#seenProps;
      if (prev === undefined) return; // first render: init() sees the props
      const props = this.#props();
      if (sameProps(propNames, props, prev)) return;
      this.#seenProps = props;
      // Inside the update cycle, so the new state renders in this same pass.
      this.#dispatch({ _tag: 'PropsChanged', props, prev } as Tagged, false);
    }

    protected override render(): unknown {
      return spec.view(this.state, intentNames as IntentNames<M>, this.#ctx());
    }

    protected override updated(changed: Map<PropertyKey, unknown>): void {
      super.updated(changed);
      if (spec.states !== undefined) this.#syncStates?.(spec.states(this.state));
    }

    #apply(next: Next<S, M>): void {
      const [state, commands] = splitNext(next);
      this.#model = { value: state };
      if (onServer) return; // commands never run on the server; the client's init starts them
      for (const cmd of commands) {
        if (cmd.driver === EMIT) dispatchOutput(this, cmd.input);
        else if (cmd.driver === STORE_SEND) this.#binding.send(cmd.input as StoreSendInput);
        else if (this.#interpreter === undefined) this.#pending.push(cmd);
        else this.#interpreter.run(cmd);
      }
    }

    /**
     * Hydration (ADR 0012): use the server's state and restore props that only travelled in the
     * seed. init(props) runs again for its commands only, and they start after the hydrating
     * render: a driver that answers synchronously must not change state before hydration.
     */
    #resumeFromSeed(): void {
      if (this.#model !== undefined) return;
      const seed = takeSeed(this);
      if (seed === undefined) return;
      restoreProps(this, propNames, seed.props);
      this.#seenProps = this.#props();
      const [, commands] = splitNext(runInit(spec, this.#seenProps));
      // Sound: the seed is this component's own state, serialized by writeSeed() on the server.
      this.#model = { value: seed.state as S };
      this.#afterHydration = commands;
    }

    protected override firstUpdated(changed: Map<PropertyKey, unknown>): void {
      super.firstUpdated(changed);
      const commands = this.#afterHydration;
      if (commands.length === 0) return;
      this.#afterHydration = [];
      // After the hydrating update has fully completed, so results start a fresh update.
      void this.updateComplete.then(() => {
        this.#apply([this.state, commands]);
      });
    }

    #resolve = (driver: AnyDriver): AnyDriver =>
      this.drivers[driver.name] ?? spec.drivers?.[driver.name] ?? driver;

    #onEvent = (event: Event): void => {
      handleIntent(event, this.renderRoot, parsers, tag, this.#deliver);
    };

    #deliver = (msg: Tagged | undefined): void => {
      if (msg !== undefined && this.isConnected) this.#dispatch(msg);
    };

    #ctx(): Ctx<P> {
      return { props: this.#props(), read: (store) => this.#binding.read(store) };
    }

    #storeChanged(store: AnyStore, state: unknown, prev: unknown): void {
      if (reducers['StoreChanged'] === undefined) this.requestUpdate();
      else this.#dispatch({ _tag: 'StoreChanged', store: store.name, state, prev } as Tagged);
    }

    #props(): P {
      // Sound: propNames are exactly the declared props, P's keys.
      return readProps(this, propNames) as P;
    }
  }

  if (customElements.get(tag) === undefined) customElements.define(tag, Element);
  // Sound: the declared props are reactive properties on every instance.
  return Element as unknown as GyralElementClass<S, M, P, O>;
}

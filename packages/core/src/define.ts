import { isServer, LitElement } from 'lit';
import { providedDriver } from './drivers-scope.js';
import {
  DEVTOOLS_ENABLED,
  devCommands,
  devConnect,
  devHydrated,
  devOwner,
  devUpdate,
} from '#devtools';
import {
  splitNext,
  type AnyDriver,
  type Command,
  type DriverOverrides,
  type Next,
} from './command.js';
import { dispatchOutput, EMIT } from './children.js';
import { FOCUS, focusAfterUpdate, type FocusInput } from './focus.js';
import type { GyralElement, GyralElementClass } from './element-types.js';
import { fillEmptyTextParts, takeSeed, writeSeed } from './hydration.js';
import { markIsland, scheduleIsland } from './islands.js';
import { runInit } from './init.js';
import { handleIntent, intentNames, listenForIntents, markGyralHost } from './intent.js';
import {
  componentStyles,
  hydrateLight,
  hydrateShadow,
  isLight,
  markLightHost,
} from './light-dom.js';
import { makeInterpreter, type Interpreter } from './internal/interpreter.js';
import {
  missingRequired,
  readProps,
  readRawProps,
  restoreProps,
  sameProps,
  shadowedBuiltins,
  type PropTable,
} from './props.js';
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

const DEFER_HYDRATION = 'defer-hydration';

/**
 * Has Lit's hydrate support patched LitElement? It then defers `defer-hydration` elements
 * itself. A bundler can evaluate Lit before `@gyral/ssr/hydrate`, so it may not have
 * (gyral-czi.41); the patch adds an own static `observedAttributes` to LitElement.
 */
const litDefers = (): boolean =>
  Object.prototype.hasOwnProperty.call(LitElement, 'observedAttributes');

/**
 * Compiles a Model-View-Intent spec into a custom element and registers it under `tag`.
 * See docs/design-docs/0001-mvi-parsed-intent.md, 0006-effects-and-drivers.md, 0007-props.md
 * 0008-forms.md and 0012-ssr.md.
 */
export function define<S, M extends Tagged, P extends object = object, O extends Tagged = never>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): GyralElementClass<S, M, P, O> {
  const propTable = (spec.props ?? {}) as PropTable;
  const propNames = Object.keys(propTable);
  const shadowed = onServer ? [] : shadowedBuiltins(propNames);
  if (shadowed.length > 0) {
    console.warn(
      `<${tag}> declares prop(s) that shadow built-in element properties: ` +
        `${shadowed.join(', ')}. Setting them changes platform behaviour ` +
        `(a prop named "hidden" hides the element). Rename them.`,
    );
  }
  const parsers = spec.intent as Readonly<Record<string, IntentParser<M> | undefined>>;
  // Sound: #dispatch() only calls the reducer whose key equals msg._tag.
  const reducers = spec.update as unknown as Readonly<
    Record<string, ((state: S, msg: Tagged, ctx: Ctx<P>) => Next<S, M>) | undefined>
  >;

  class Element extends LitElement implements GyralElement<S, M> {
    static override properties = spec.props ?? {};
    static override styles = componentStyles(spec, tag);
    static readonly spec = spec;
    static readonly tagName = tag;

    // Always observe `defer-hydration`, so Gyral can defer server-rendered children itself
    // when Lit's hydrate support isn't installed (gyral-czi.41, ADR 0012).
    static override get observedAttributes(): string[] {
      const base = super.observedAttributes;
      return base.includes(DEFER_HYDRATION) ? base : [...base, DEFER_HYDRATION];
    }

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
    /** Resumed from server markup; reported by the Hydrated message. */
    #serverRendered = false;
    /** The renderRoot is a server-rendered (declarative) shadow root to hydrate in place. */
    #ssrShadow = false;
    /** The latest view-transition update, awaited by updateComplete. */
    #transition: Promise<void> | undefined;
    /** Mirrors spec.states onto CSS custom states; only attached when the spec asks. */
    #syncStates: StateSync | undefined =
      spec.states === undefined || onServer ? undefined : attachStates(this);

    get state(): S {
      if (this.#model === undefined) {
        const missing = missingRequired(this, propTable);
        if (missing.length > 0) {
          console.warn(`<${tag}> is missing required prop(s): ${missing.join(', ')}.`);
        }
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
      if (DEVTOOLS_ENABLED) devUpdate(this, tag, msg, prev, this.state);
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
      // A component server-rendered inside another's view waits (`defer-hydration`) for its
      // parent to hydrate first. Lit's hydrate support, when installed, defers LitElement
      // itself; otherwise Gyral holds back Lit's connect until the attribute goes.
      const waiting = this.hasAttribute(DEFER_HYDRATION);
      if (!waiting || litDefers()) super.connectedCallback();
      if (waiting) {
        scheduleIsland(this); // lazy islands release themselves (gyral-4k7.4)
        return;
      }
      this.#connect();
    }

    override attributeChangedCallback(name: string, old: string | null, value: string | null) {
      super.attributeChangedCallback(name, old, value);
      if (name !== DEFER_HYDRATION || value !== null || !this.isConnected) return;
      if (!litDefers()) super.connectedCallback(); // Lit's support would have connected it
      this.#connect();
    }

    #connect(): void {
      // Re-resolve on every connect: the nearest <gyral-stores> may differ after a move.
      if (this.#binding.connect()) this.requestUpdate();
      this.#interpreter = makeInterpreter<M | IntentRejected>(
        this.#resolve,
        (msg) => {
          this.#dispatch(msg);
        },
        DEVTOOLS_ENABLED ? devCommands(() => devOwner(this, tag)) : undefined,
      );
      if (DEVTOOLS_ENABLED) devConnect(this, tag, true);
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
      if (DEVTOOLS_ENABLED) devConnect(this, tag, false);
    }

    protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
      super.willUpdate(changed);
      if (onServer) {
        // Server renders run constructor, willUpdate and render only (ADR 0012).
        // init is pure, so the client can recompute an unchanged state from the props.
        const [initial] = splitNext(runInit(spec, this.#props()));
        writeSeed(this, this.state, readRawProps(this, propTable), propTable, { value: initial });
        if (isLight(spec)) markLightHost(this);
        markIsland(this, spec.hydrate);
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

    // Light-DOM mode (ADR 0014): render into the element itself. A server-rendered shadow root
    // (Declarative Shadow DOM) is reused as is and hydrated in update() (gyral-czi.41): this
    // bypasses Lit's hydrate-support patch on purpose, so hydration is correct whether or not
    // that patch was installed before Lit evaluated (bundlers can reorder it; ADR 0012).
    protected override createRenderRoot(): HTMLElement | DocumentFragment {
      if (isLight(spec)) return this;
      if (!onServer && this.shadowRoot !== null) {
        this.#ssrShadow = true;
        return this.shadowRoot;
      }
      return super.createRenderRoot();
    }

    protected override update(changed: Map<PropertyKey, unknown>): void {
      if (this.#ssrShadow && !this.hasUpdated) {
        const styles = (this.constructor as typeof LitElement).elementStyles;
        hydrateShadow(this.renderRoot as ShadowRoot, this.render(), this.renderOptions, styles);
      }
      if (isLight(spec) && !this.hasUpdated && this.#serverRendered) {
        hydrateLight(this, this.render(), this.renderOptions); // ADR 0014
      }
      super.update(changed);
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
        else if (cmd.driver === FOCUS) focusAfterUpdate(this, tag, cmd.input as FocusInput);
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
      const [initial, commands] = splitNext(runInit(spec, this.#seenProps));
      // Sound: the seed is this component's own state, serialized by writeSeed() on the server;
      // when absent, the server's state was exactly init(props) (seed deduplication).
      this.#model = { value: 'state' in seed ? (seed.state as S) : initial };
      this.#afterHydration = commands;
      this.#serverRendered = true;
    }

    protected override firstUpdated(changed: Map<PropertyKey, unknown>): void {
      super.firstUpdated(changed);
      if (this.#serverRendered) fillEmptyTextParts(this.renderRoot); // gyral-4k7.12
      if (DEVTOOLS_ENABLED) devHydrated(this, tag, this.#serverRendered);
      const commands = this.#afterHydration;
      const wantsHydrated = reducers['Hydrated'] !== undefined;
      if (commands.length === 0 && !wantsHydrated) return;
      this.#afterHydration = [];
      // After the first (possibly hydrating) update has fully completed, so whatever these
      // change starts a fresh update instead of diverging from the server markup.
      void this.updateComplete.then(() => {
        if (wantsHydrated) {
          this.#dispatch({ _tag: 'Hydrated', serverRendered: this.#serverRendered } as Tagged);
        }
        if (commands.length > 0) this.#apply([this.state, commands]);
      });
    }

    // el.drivers → nearest provider → spec.drivers → the command's own (gyral-czi.35).
    #resolve = (driver: AnyDriver): AnyDriver =>
      this.drivers[driver.name] ??
      providedDriver(this, driver.name) ??
      spec.drivers?.[driver.name] ??
      driver;

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
      return readProps(this, propTable) as P;
    }
  }

  markGyralHost(Element);
  if (customElements.get(tag) === undefined) customElements.define(tag, Element);
  // Sound: the declared props are reactive properties on every instance.
  return Element as unknown as GyralElementClass<S, M, P, O>;
}

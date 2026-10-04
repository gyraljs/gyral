import { isServer, LitElement } from 'lit';
import {
  splitNext,
  type AnyDriver,
  type Command,
  type DriverOverrides,
  type Next,
} from './command.js';
import { EMIT } from './children.js';
import { takeSeed, writeSeed } from './hydration.js';
import { runInit } from './init.js';
import { INTENT_EVENTS, OUTPUT_EVENT, readIntent } from './intent.js';
import { makeInterpreter, type Interpreter } from './internal/interpreter.js';
import { attachStates, type StateSync } from './states.js';
import { withViewTransition } from './transitions.js';
import type { ComponentSpec, Ctx, IntentNames, IntentParser, Tagged } from './types.js';

/** The custom element class produced by `define()`. */
export interface GyralElement<S, M extends Tagged> extends LitElement {
  /** Current model state. */
  readonly state: S;
  /** Feeds a message through `update`, as if an intent had produced it. */
  send(msg: M): void;
  /** Per-instance driver substitutions by name (test fakes). Checked before the spec's. */
  drivers: DriverOverrides;
  /**
   * Messages applied through `update` right after `init`, before the first render. The server
   * uses it to render a rejected form with the same reducer as the JS path (ADR 0008). Ignored
   * when the element resumes from a hydration seed (the seed already contains their effect).
   */
  initialMessages: readonly Tagged[];
}

export interface GyralElementClass<S, M extends Tagged, P, O extends Tagged = never> {
  /** Instances expose their declared props as settable properties. */
  new (): GyralElement<S, M> & { -readonly [K in keyof P]: P[K] };
  readonly spec: ComponentSpec<S, M, P>;
  readonly tagName: string;
  /** Type-only: the outputs this component emits (read by `child()`). */
  readonly outputs?: O;
}

// Lit types `isServer` per build condition; widen it so both branches type-check (ADR 0012).
const onServer: boolean = isServer;

// Any property read returns its own name, so `intents.Increment === 'Increment'`.
// Types restrict reads to real message tags; a tag without a parser warns at event time.
const intentNames = new Proxy(
  {},
  { get: (_target, key) => (typeof key === 'string' ? key : undefined) },
);

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
    initialMessages: readonly Tagged[] = [];

    #model: { value: S } | undefined;
    /** Props as of the last init or PropsChanged; the `prev` of the next PropsChanged. */
    #seenProps: P | undefined;
    #listening = false;
    #interpreter: Interpreter<M> | undefined;
    #pending: Command<M>[] = [];
    /** init's commands on the hydration path; started in firstUpdated (ADR 0012). */
    #afterHydration: readonly Command<M>[] = [];
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
        // Framework messages have optional reducers; props stay readable as context.
        if (msg._tag !== 'PropsChanged') {
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
      this.#interpreter = makeInterpreter<M>(this.#resolve, (msg) => {
        this.send(msg);
      });
      const pending = this.#pending;
      this.#pending = [];
      for (const cmd of pending) this.#interpreter.run(cmd);
      if (this.#listening) return;
      // Capture phase: non-bubbling events (toggle) reach the root too (ADR 0001).
      for (const type of new Set([...INTENT_EVENTS, ...(spec.events ?? [])])) {
        this.renderRoot.addEventListener(type, this.#onEvent, { capture: true });
      }
      this.#listening = true;
    }

    override disconnectedCallback(): void {
      super.disconnectedCallback();
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
      const record = (p: P) => p as Readonly<Record<string, unknown>>;
      if (propNames.every((name) => Object.is(record(props)[name], record(prev)[name]))) return;
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
        if (cmd.driver === EMIT) this.#emit(cmd.input);
        else if (this.#interpreter === undefined) this.#pending.push(cmd);
        else this.#interpreter.run(cmd);
      }
    }

    // A microtask keeps outputs in order and out of the parent's render pass. Outputs bubble
    // through the parent's shadow tree only (not composed), so they never leak further up.
    #emit(output: unknown): void {
      queueMicrotask(() => {
        if (!this.isConnected) return;
        this.dispatchEvent(
          new CustomEvent(OUTPUT_EVENT, { detail: output, bubbles: true, composed: false }),
        );
      });
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
      const self = this as unknown as Record<string, unknown>;
      for (const [name, value] of Object.entries(seed.props)) {
        if (propNames.includes(name) && self[name] === undefined) self[name] = value;
      }
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
      const input = readIntent(event, this.renderRoot);
      if (input === undefined) return;
      const parser = parsers[input.name];
      if (parser === undefined) {
        console.warn(`<${tag}> has no intent parser for data-intent="${input.name}".`);
        return;
      }
      const result = parser(input);
      if (result instanceof Promise) {
        result.then(this.#deliver, (error: unknown) => {
          console.error(`<${tag}> intent parser for "${input.name}" failed`, error);
        });
      } else {
        this.#deliver(result);
      }
    };

    #deliver = (msg: Tagged | undefined): void => {
      if (msg !== undefined && this.isConnected) this.#dispatch(msg);
    };

    #ctx(): Ctx<P> {
      return { props: this.#props() };
    }

    #props(): P {
      const self = this as unknown as Readonly<Record<string, unknown>>;
      return Object.fromEntries(propNames.map((name) => [name, self[name]])) as P;
    }
  }

  if (customElements.get(tag) === undefined) customElements.define(tag, Element);
  // Sound: the declared props are reactive properties on every instance.
  return Element as unknown as GyralElementClass<S, M, P, O>;
}

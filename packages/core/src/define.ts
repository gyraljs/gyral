import { LitElement } from 'lit';
import {
  splitNext,
  type AnyDriver,
  type Command,
  type DriverOverrides,
  type Next,
} from './command.js';
import { INTENT_EVENTS, readIntent } from './intent.js';
import { makeInterpreter, type Interpreter } from './internal/interpreter.js';
import type { ComponentSpec, Ctx, IntentNames, IntentParser, Tagged } from './types.js';

/** The custom element class produced by `define()`. */
export interface GyralElement<S, M extends Tagged> extends LitElement {
  /** Current model state. */
  readonly state: S;
  /** Feeds a message through `update`, as if an intent had produced it. */
  send(msg: M): void;
  /** Per-instance driver substitutions by name (test fakes). Checked before the spec's. */
  drivers: DriverOverrides;
}

export interface GyralElementClass<S, M extends Tagged, P> {
  new (): GyralElement<S, M>;
  readonly spec: ComponentSpec<S, M, P>;
  readonly tagName: string;
}

// Any property read returns its own name, so `intents.Increment === 'Increment'`.
// Types restrict reads to real message tags; a tag without a parser warns at event time.
const intentNames = new Proxy(
  {},
  { get: (_target, key) => (typeof key === 'string' ? key : undefined) },
);

/**
 * Compiles a Model-View-Intent spec into a custom element and registers it under `tag`.
 * See docs/design-docs/0001-mvi-parsed-intent.md, 0006-effects-and-drivers.md, 0007-props.md
 * and 0008-forms.md.
 */
export function define<S, M extends Tagged, P extends object = object>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): GyralElementClass<S, M, P> {
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

    #model: { value: S } | undefined;
    /** Props as of the last init or PropsChanged; the `prev` of the next PropsChanged. */
    #seenProps: P | undefined;
    #listening = false;
    #interpreter: Interpreter<M> | undefined;
    #pending: Command<M>[] = [];

    get state(): S {
      if (this.#model === undefined) {
        this.#seenProps = this.#props();
        this.#apply(spec.init(this.#seenProps));
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
      this.#apply(reducer(this.state, msg, this.#ctx()));
      if (render) this.requestUpdate();
    }

    override connectedCallback(): void {
      super.connectedCallback();
      this.#interpreter = makeInterpreter<M>(this.#resolve, (msg) => {
        this.send(msg);
      });
      const pending = this.#pending;
      this.#pending = [];
      for (const cmd of pending) this.#interpreter.run(cmd);
      if (this.#listening) return;
      for (const type of INTENT_EVENTS) this.renderRoot.addEventListener(type, this.#onEvent);
      this.#listening = true;
    }

    override disconnectedCallback(): void {
      super.disconnectedCallback();
      this.#interpreter?.dispose();
      this.#interpreter = undefined;
    }

    protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
      super.willUpdate(changed);
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

    #apply(next: Next<S, M>): void {
      const [state, commands] = splitNext(next);
      this.#model = { value: state };
      for (const cmd of commands) {
        if (this.#interpreter === undefined) this.#pending.push(cmd);
        else this.#interpreter.run(cmd);
      }
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
  return Element;
}

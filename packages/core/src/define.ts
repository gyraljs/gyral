import { LitElement } from 'lit';
import { INTENT_EVENTS, readIntent } from './intent.js';
import type { ComponentSpec, IntentNames, IntentParser, Tagged } from './types.js';

/** The custom element class produced by `define()`. */
export interface GyralElement<S, M extends Tagged> extends LitElement {
  /** Current model state. */
  readonly state: S;
  /** Feeds a message through `update`, as if an intent had produced it. */
  send(msg: M): void;
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
 * See docs/design-docs/0001-mvi-parsed-intent.md.
 */
export function define<S, M extends Tagged, P extends object = object>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): GyralElementClass<S, M, P> {
  const propNames = Object.keys(spec.props ?? {});
  const parsers = spec.intent as Readonly<Record<string, IntentParser<M> | undefined>>;
  // Sound: send() only calls the reducer whose key equals msg._tag.
  const reducers = spec.update as unknown as Readonly<Record<string, (state: S, msg: M) => S>>;

  class Element extends LitElement implements GyralElement<S, M> {
    static override properties = spec.props ?? {};
    static override styles = spec.styles ?? [];
    static readonly spec = spec;
    static readonly tagName = tag;

    #model: { value: S } | undefined;
    #listening = false;

    get state(): S {
      this.#model ??= { value: spec.init(this.#props()) };
      return this.#model.value;
    }

    send(msg: M): void {
      const reducer = reducers[msg._tag];
      if (reducer === undefined) {
        console.warn(`<${tag}> has no update for message "${msg._tag}".`);
        return;
      }
      this.#model = { value: reducer(this.state, msg) };
      this.requestUpdate();
    }

    override connectedCallback(): void {
      super.connectedCallback();
      if (this.#listening) return;
      for (const type of INTENT_EVENTS) this.renderRoot.addEventListener(type, this.#onEvent);
      this.#listening = true;
    }

    protected override render(): unknown {
      return spec.view(this.state, intentNames as IntentNames<M>);
    }

    #onEvent = (event: Event): void => {
      const input = readIntent(event, this.renderRoot);
      if (input === undefined) return;
      const parser = parsers[input.name];
      if (parser === undefined) {
        console.warn(`<${tag}> has no intent parser for data-intent="${input.name}".`);
        return;
      }
      const msg = parser(input);
      if (msg !== undefined) this.send(msg);
    };

    #props(): P {
      const self = this as unknown as Readonly<Record<string, unknown>>;
      return Object.fromEntries(propNames.map((name) => [name, self[name]])) as P;
    }
  }

  if (customElements.get(tag) === undefined) customElements.define(tag, Element);
  return Element;
}

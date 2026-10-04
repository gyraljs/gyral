import type { CSSResultGroup, PropertyDeclaration } from 'lit';
import type { DriverOverrides, Next } from './command.js';

/** Every message is a tagged object; the tag is also the intent name used in markup. */
export interface Tagged {
  readonly _tag: string;
}

/** What the intent layer sees when a `data-intent` element fires its trigger event. */
export interface IntentInput {
  /** The `data-intent` value (a message tag). */
  readonly name: string;
  readonly event: Event;
  /** The element carrying `data-intent`. */
  readonly target: Element;
  /** `value` of the input, select, textarea or button that carries the intent. */
  readonly value: string | undefined;
  /** `checked` for checkbox and radio inputs. */
  readonly checked: boolean | undefined;
  /** Submitted data (including the submitter button) when the intent is on a `<form>`. */
  readonly formData: FormData | undefined;
}

/** Parses a platform event into one message variant, or `undefined` to ignore it. */
export type IntentParser<M> = (input: IntentInput) => M | undefined;

type Variant<M extends Tagged, K extends M['_tag']> = Extract<M, { readonly _tag: K }>;

/** Intent parsers keyed by the message tag they produce. Messages from drivers need none. */
export type Intents<M extends Tagged> = {
  readonly [K in M['_tag']]?: IntentParser<Variant<M, K>>;
};

/** One pure reducer per message tag. Exhaustive by construction. May return commands. */
export type Update<S, M extends Tagged> = {
  readonly [K in M['_tag']]: (state: S, msg: Variant<M, K>) => Next<S, M>;
};

/** Typed intent names handed to the view, so `data-intent=${i.Increment}` is checked. */
export type IntentNames<M extends Tagged> = { readonly [K in M['_tag']]: K };

export type PropDeclarations<P> = { readonly [K in keyof P]: PropertyDeclaration };

export interface ComponentSpec<S, M extends Tagged, P> {
  /** Lit reactive property declarations: the component's inputs. */
  readonly props?: PropDeclarations<P>;
  /** Initial model state (and optional commands), computed from props on first render. */
  readonly init: (props: P) => Next<S, M>;
  /** INTENT: platform events to messages. */
  readonly intent: Intents<M>;
  /** MODEL: pure state transitions. */
  readonly update: Update<S, M>;
  /** VIEW: pure function of state. Name intents in markup; never attach closures. */
  readonly view: (state: S, intents: IntentNames<M>) => unknown;
  readonly styles?: CSSResultGroup;
  /** Driver substitutions by name, for every instance (ADR 0006). */
  readonly drivers?: DriverOverrides;
}

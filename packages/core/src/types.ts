import type { CSSResultGroup, PropertyDeclaration } from 'lit';
import type { DriverOverrides, Next } from './command.js';
import type { AnyStore, StoreChanged, StoreRef } from './store.js';

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
  /** The output a child component emitted, when the intent is on a child element. */
  readonly detail: unknown;
  /** `KeyboardEvent.key` for `keydown`/`keyup` intents. */
  readonly key: string | undefined;
  /** For `toggle` intents (popover, `<details>`): the state it changed to. */
  readonly newState: 'open' | 'closed' | undefined;
}

/** Reads a declared store's current state, typed by the store (ADR 0013). */
export type StoreReader = <S>(store: StoreRef<S>) => S;

/** Read-only context handed to every reducer and to the view (ADR 0007, 0013). */
export interface Ctx<P> {
  /** Props from above. */
  readonly props: P;
  /** Stores from the side: `read(cart).lines`. The store must be in `spec.stores`. */
  readonly read: StoreReader;
}

/** Framework message: declared props changed after the first render (ADR 0007). */
export interface PropsChanged<P> {
  readonly _tag: 'PropsChanged';
  readonly props: P;
  readonly prev: P;
}

/** One validation problem. `path` is dot-joined and matches the field's `name`. */
export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

/** Submitted text values of a form (Files are dropped: they can't be re-filled). */
export type FormFields = Readonly<Record<string, string | readonly string[]>>;

/** Framework message: an intent's input failed schema validation (ADR 0008). */
export interface IntentRejected {
  readonly _tag: 'IntentRejected';
  /** The `data-intent` name whose input was rejected. */
  readonly intent: string;
  readonly issues: readonly FieldIssue[];
  /**
   * For `form()` rejections: what the user submitted, so the view can re-fill the form. On
   * the no-JS path (ADR 0008 server half) the server re-renders the page from this.
   */
  // `| undefined` so schemas with plain optional fields (valibot `optional`) can produce it.
  readonly values?: FormFields | undefined;
}

type ParseResult<M> = M | IntentRejected | undefined;

/**
 * Parses a platform event into one message variant, `IntentRejected`, or `undefined` to
 * ignore it. May be async because schema validation may be.
 */
export type IntentParser<M> = (input: IntentInput) => ParseResult<M> | Promise<ParseResult<M>>;

type Variant<M extends Tagged, K extends M['_tag']> = Extract<M, { readonly _tag: K }>;

/** Intent parsers keyed by the message tag they produce. Messages from drivers need none. */
export type Intents<M extends Tagged> = {
  readonly [K in M['_tag']]?: IntentParser<Variant<M, K>>;
};

type Reducer<S, M, Msg, P> = (state: S, msg: Msg, ctx: Ctx<P>) => Next<S, M>;

/**
 * One pure reducer per message tag (exhaustive by construction), plus optional reducers
 * for framework messages. Reducers may return commands.
 */
export type Update<S, M extends Tagged, P = object> = {
  readonly [K in M['_tag']]: Reducer<S, M, Variant<M, K>, P>;
} & {
  readonly PropsChanged?: Reducer<S, M, PropsChanged<P>, P>;
  readonly IntentRejected?: Reducer<S, M, IntentRejected, P>;
  readonly StoreChanged?: Reducer<S, M, StoreChanged, P>;
};

/** Typed intent names handed to the view, so `data-intent=${i.Increment}` is checked. */
export type IntentNames<M extends Tagged> = { readonly [K in M['_tag']]: K };

export type PropDeclarations<P> = { readonly [K in keyof P]: PropertyDeclaration };

/** State of a component that keeps none (a pure view of its props). Its `init` is optional. */
export type Stateless = Readonly<Record<string, never>>;

/** Initial model state (and optional commands), computed from props on first render. */
type Init<S, M, P> = (props: P) => Next<S, M>;

// `init` may be omitted only when an empty object is a valid state (Stateless, all-optional).
type InitField<S, M extends Tagged, P> = Stateless extends S
  ? { readonly init?: Init<S, M, P> }
  : { readonly init: Init<S, M, P> };

export type ComponentSpec<S, M extends Tagged, P> = SpecBody<S, M, P> & InitField<S, M, P>;

interface SpecBody<S, M extends Tagged, P> {
  /** Lit reactive property declarations: the component's inputs. */
  readonly props?: PropDeclarations<P>;
  /** INTENT: platform events to messages. */
  readonly intent: Intents<M>;
  /** MODEL: pure state transitions. */
  readonly update: Update<S, M, P>;
  /** VIEW: pure function of state and props. Name intents in markup; never attach closures. */
  readonly view: (state: S, intents: IntentNames<M>, ctx: Ctx<P>) => unknown;
  readonly styles?: CSSResultGroup;
  /** Extra event types that may trigger intents via `data-intent-on` (e.g. `pointerdown`). */
  readonly events?: readonly string[];
  /** Driver substitutions by name, for every instance (ADR 0006). */
  readonly drivers?: DriverOverrides;
  /**
   * Stores this component reads with `ctx.read(store)` and writes with `send(store, msg)`.
   * Their changes re-render it (and reach the optional `StoreChanged` reducer). ADR 0013.
   */
  readonly stores?: readonly AnyStore[];
  /**
   * Return `true` to render this state change inside a View Transition (route changes, list
   * reorders). Skipped without browser support or when reduced motion is requested.
   */
  readonly viewTransition?: (prev: S, next: S, msg: Tagged) => boolean;
  /**
   * Boolean facts about the state, exposed to CSS as custom states:
   * `states: (s) => ({ loading: s._tag === 'Loading' })` enables `:host(:state(loading))` and
   * `gy-x:state(loading)`. Applied after each render; feature-detected; not on the server.
   */
  readonly states?: (state: S) => Readonly<Record<string, boolean>>;
}

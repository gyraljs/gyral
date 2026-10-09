import type { Prop } from './prop.js';
import type { ChildValue, Styles } from './view/index.js';
import type { CommandInfo } from './invokers.js';
import type { HydrateStrategy } from './islands.js';
import type { DriverOverrides, Next } from './command.js';
import type { AnyStore, StoreChanged, StoreRef } from './store.js';

/** Every message is a tagged object; the tag is also the intent name used in markup. */
export interface Tagged {
  readonly _tag: string;
}

/** What the intent layer sees when an element's intent fires. */
export interface IntentInput {
  /** The intent's name (a message tag): the `data-intent-<event>` or `data-intent` value. */
  readonly name: string;
  readonly event: Event;
  /** The element carrying the intent attribute (`event.currentTarget` is Gyral's root). */
  readonly target: Element;
  /** `value` of the input, select, textarea or button that carries the intent. */
  readonly value: string | undefined;
  /** `checked` for checkbox and radio inputs. */
  readonly checked: boolean | undefined;
  /** Submitted data (including the submitter button) when the intent is on a `<form>`. */
  readonly formData: FormData | undefined;
  /**
   * `detail` of any `CustomEvent`: a Gyral child's output, or the event of another custom
   * element (a map's `marker-select`). Unknown until the parser checks it (a guard, a schema).
   */
  readonly detail: unknown;
  /** `KeyboardEvent.key` for `keydown`/`keyup` intents. */
  readonly key: string | undefined;
  /** For `toggle` intents (popover, `<details>`): the state it changed to. */
  readonly newState: 'open' | 'closed' | undefined;
  /** For `command` intents: the invoker's command (e.g. `--clear`) and source (gyral-czi.6). */
  readonly command: CommandInfo | undefined;
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

/**
 * Framework message: the component is live in the browser (ADR 0012 addendum). Sent once,
 * after the first client render has completed, to every client-side instance. Use it for
 * progressive enhancement: render the no-JS form on the server and in the first client render
 * (so hydration matches), then switch to the enhanced UI in the `Hydrated` reducer.
 */
export interface Hydrated {
  readonly _tag: 'Hydrated';
  /** `true` when the instance resumed from server-rendered markup (a hydration seed). */
  readonly serverRendered: boolean;
}

/**
 * Framework message: the host is back in the document after it was really detached (view/05
 * "Lifecycle"). Disconnecting stops a host's commands one microtask later, so a move (a
 * disconnect and connect in the same task, as `appendChild`/`insertBefore` reorders do) keeps
 * them running and sends nothing. Only a host that stayed detached long enough for its commands
 * to stop receives `Connected` when it is attached again; re-issue long-lived commands (a
 * `subscription()`, a periodic timer) from its reducer. Never sent on the first connect: `init`
 * covers that.
 */
export interface Connected {
  readonly _tag: 'Connected';
  /** Always `true`: `Connected` is only sent when a stopped host is attached again. */
  readonly reconnect: true;
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
 * decline it: a synchronous `undefined` passes the event to the next intent outward for the
 * same event (view/05-element.md "Declining"). May be async because schema validation may be;
 * an async parser keeps the event. `ctx` is the read-only context
 * reducers get (props as they are when the event fires, `read(store)`); parsers that don't
 * need it take one parameter.
 */
export type IntentParser<M, P = unknown> = (
  input: IntentInput,
  ctx: Ctx<P>,
) => ParseResult<M> | Promise<ParseResult<M>>;

type Variant<M extends Tagged, K> = Extract<M, { readonly _tag: K }>;

/**
 * The parser for intent name `K` (ADR 0023): a name that is a message tag parses into that
 * variant; any other name is an intent of its own whose parser may produce any message.
 */
export type ParserFor<M extends Tagged, P, K> = K extends M['_tag']
  ? IntentParser<Variant<M, K>, P>
  : IntentParser<M, P>;

/**
 * Intent parsers keyed by intent name (ADR 0001, ADR 0023). The keys are the component's
 * intent names: `define<State, Msg>()(tag, { intent: { Archive: …, Increment: … } })` gives the
 * view `i.Archive` and `i.Increment`. A key that is a message tag must return that variant; any
 * other key may return any message (several controls that change one thing can also share one
 * intent and tell themselves apart by `name`). Messages from drivers need no parser.
 */
export type Intents<M extends Tagged, P = unknown, N extends string = string> = {
  readonly [K in N]: ParserFor<M, P, K>;
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
  readonly Hydrated?: Reducer<S, M, Hydrated, P>;
  readonly Connected?: Reducer<S, M, Connected, P>;
};

/**
 * A component's intent names, the keys of its `intent` object, as the view's `i` and as
 * `intentsOf<typeof C>()`, so `data-intent=${i.Increment}` is checked (ADR 0023).
 */
export type IntentNames<N extends string> = { readonly [K in N]: K };

/**
 * The prop builders for props type `P` (view/05-element.md "Props"): one `prop.*` builder per
 * key. A builder's output type must fit the prop's type, so a prop whose type excludes
 * `undefined` needs `required: true` or a `default` (the honesty rule, ADR 0007 addendum).
 * Without explicit type arguments, `define()` infers `P` from the builders.
 */
export type PropDeclarations<P> = { readonly [K in keyof P]-?: Prop<P[K]> };

/** State of a component that keeps none (a pure view of its props). Its `init` is optional. */
export type Stateless = Readonly<Record<string, never>>;

/** Initial model state (and optional commands), computed from props on first render. */
type Init<S, M, P> = (props: P) => Next<S, M>;

// `init` may be omitted only when an empty object is a valid state (Stateless, all-optional).
type InitField<S, M extends Tagged, P> = Stateless extends S
  ? { readonly init?: Init<S, M, P> }
  : { readonly init: Init<S, M, P> };

/**
 * A component spec. `N` is the component's intent names, the keys of `intent` (ADR 0023).
 */
export type ComponentSpec<S, M extends Tagged, P, N extends string = string> = SpecBody<
  S,
  M,
  P,
  N,
  Intents<M, P, N>
> &
  InitField<S, M, P>;

/**
 * `spec.shadow`: `true` (the default) or an object for a shadow root, `false` for light DOM.
 * `delegatesFocus: true`: focusing the host, or clicking a non-focusable part of it, focuses its
 * first focusable element, and `:focus` matches the host while focus is inside; the server
 * writes `shadowrootdelegatesfocus` on the declarative shadow root (view/05-element.md "Focus").
 */
export type ShadowOption = boolean | { readonly delegatesFocus?: boolean };

interface SpecBody<S, M extends Tagged, P, N extends string, I> {
  /** The component's inputs, declared with `prop.*` builders. */
  readonly props?: PropDeclarations<P>;
  /** INTENT: platform events to messages. */
  readonly intent: I;
  /** MODEL: pure state transitions. */
  readonly update: Update<S, M, P>;
  /**
   * VIEW: pure function of state and props. Name intents in markup; never attach closures.
   * (A method, so a class typed with fewer intent names, e.g. `GyralElementClass<S, M, P, O>`
   * for a recursive component, still accepts it.)
   */
  view(state: S, intents: IntentNames<N>, ctx: Ctx<P>): ChildValue;
  /**
   * Shadow-root styles: `css` values, plain CSS strings, or arrays of them, nested freely.
   * Each maps to one shared `CSSStyleSheet`. Ignored (with a warning) when `shadow: false`.
   */
  readonly styles?: Styles;
  /**
   * `false` renders the view as the element's own light-DOM children (ADR 0014): document CSS
   * applies, and the server writes plain children instead of a `<template shadowrootmode>`.
   * For page-level components (listings, articles). No `<slot>`s and no `styles`. Default `true`.
   * An object configures the shadow root (`{ delegatesFocus: true }`).
   */
  readonly shadow?: ShadowOption;
  /**
   * When a server-rendered instance hydrates (gyral-4k7.4): `load` (default), `idle`,
   * `visible` (scrolled into view) or `interaction` (first pointer/focus). Client-only
   * renders are unaffected.
   */
  readonly hydrate?: HydrateStrategy;
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
   * Messages from bursty sources (a WebSocket feed, a sensor) whose renders wait for the next
   * animation frame, so many messages in one frame cost one render: `renderOnFrame: ['Ticked']`.
   * Reducers still run at once. Any other change to the component renders in the usual
   * microtask flush, taking pending frame work with it. `'StoreChanged'` covers store changes.
   * Pages that get no frames (hidden) render from a 100 ms timer. view/04-scheduler.md.
   */
  readonly renderOnFrame?: readonly (M['_tag'] | 'StoreChanged')[];
  /**
   * Boolean facts about the state, exposed to CSS as custom states:
   * `states: (s) => ({ loading: s._tag === 'Loading' })` enables `:host(:state(loading))` and
   * `gy-x:state(loading)`. Applied after each render; feature-detected; not on the server.
   */
  readonly states?: (state: S) => Readonly<Record<string, boolean>>;
}

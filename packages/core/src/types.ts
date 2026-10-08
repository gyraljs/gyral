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
  /** The output a child component emitted, when the intent is on a child element. */
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
 * ignore it. May be async because schema validation may be. `ctx` is the read-only context
 * reducers get (props as they are when the event fires, `read(store)`); parsers that don't
 * need it take one parameter.
 */
export type IntentParser<M, P = unknown> = (
  input: IntentInput,
  ctx: Ctx<P>,
) => ParseResult<M> | Promise<ParseResult<M>>;

type Variant<M extends Tagged, K extends M['_tag']> = Extract<M, { readonly _tag: K }>;

/**
 * Intent parsers keyed by the message tag they produce. Messages from drivers need none. A key
 * that isn't a tag fails with "'X' does not exist in type 'Intents<…>'": intent names are
 * message tags, so several controls that change one thing share one intent and tell
 * themselves apart by `name`.
 */
export type Intents<M extends Tagged, P = unknown> = {
  readonly [K in M['_tag']]?: IntentParser<Variant<M, K>, P>;
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
};

/** Typed intent names handed to the view, so `data-intent=${i.Increment}` is checked. */
export type IntentNames<M extends Tagged> = { readonly [K in M['_tag']]: K };

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

export type ComponentSpec<S, M extends Tagged, P> = SpecBody<S, M, P> & InitField<S, M, P>;

interface SpecBody<S, M extends Tagged, P> {
  /** The component's inputs, declared with `prop.*` builders. */
  readonly props?: PropDeclarations<P>;
  /** INTENT: platform events to messages. */
  readonly intent: Intents<M, P>;
  /** MODEL: pure state transitions. */
  readonly update: Update<S, M, P>;
  /** VIEW: pure function of state and props. Name intents in markup; never attach closures. */
  readonly view: (state: S, intents: IntentNames<M>, ctx: Ctx<P>) => ChildValue;
  /**
   * Shadow-root styles: `css` values, plain CSS strings, or arrays of them, nested freely.
   * Each maps to one shared `CSSStyleSheet`. Ignored (with a warning) when `shadow: false`.
   */
  readonly styles?: Styles;
  /**
   * `false` renders the view as the element's own light-DOM children (ADR 0014): document CSS
   * applies, and the server writes plain children instead of a `<template shadowrootmode>`.
   * For page-level components (listings, articles). No `<slot>`s and no `styles`. Default `true`.
   */
  readonly shadow?: boolean;
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

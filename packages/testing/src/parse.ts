// parse(): calls one of a component's intent parsers without a DOM or casts (gyral-1zd.25).
// The input defaults to an empty IntentInput, the state to the component's initial state, and
// `ctx.read` to the given store instances. Its event (a plain Event when the runtime has one) has
// the type an `on()` parser declares, else `intent`, and carries `key` and the modifier keys, so
// `on()` parsers run in Node too (gyral-cd0).
import type {
  AnyStoreInstance,
  ComponentSpec,
  GyralElementClass,
  IntentInput,
  IntentRejected,
  Modifiers,
  ParserCtx,
  Tagged,
} from '@gyral/core';
import { ON_EVENT } from '@gyral/core/internal';
import { initial, readerOf } from './step.js';

/** What `parse` passes the parser: the fields it reads, and the modifier keys held. */
export interface ParseInput extends Partial<IntentInput> {
  /**
   * Modifier keys held (`{ ctrl: true }`; the others are up), set as `ctrlKey` and so on on the
   * event `parse` creates. Your own `event` carries its own.
   */
  readonly modifiers?: Partial<Modifiers>;
}

/** What `parse` passes the parser besides the input. */
export interface ParseOptions<S, P> {
  /** Props as the component sees them. Default `{}`. */
  readonly props?: P;
  /** The state when the event fires. Default: the component's initial state for `props`. */
  readonly state?: S;
  /** Store instances `ctx.read` resolves (ADR 0013). */
  readonly stores?: readonly AnyStoreInstance[];
}

type SpecOf<S, M extends Tagged, P, N extends string> =
  ComponentSpec<S, M, P, N> | GyralElementClass<S, M, P, Tagged, N>;

/** The message for intent `K`, as its parser declares it. */
type Parsed<M extends Tagged, K> = K extends M['_tag'] ? Extract<M, { readonly _tag: K }> : M;

/** The event `parse` creates: `type`, with the key and the modifier keys as a keyboard event has them. */
function eventOf(type: string, key: string | undefined, held: Partial<Modifiers>): Event {
  const event = typeof Event === 'function' ? new Event(type) : ({ type } as Event);
  return Object.assign(event, {
    ...(key === undefined ? {} : { key }),
    shiftKey: held.shift === true,
    ctrlKey: held.ctrl === true,
    altKey: held.alt === true,
    metaKey: held.meta === true,
  });
}

/**
 * Runs the parser of intent `name` with `input` (only the fields the parser reads are needed:
 * `{ value: '3' }`, `{ key: 'Enter', modifiers: { ctrl: true } }`, `{ detail }`). Returns what
 * the parser returns: a message, an `IntentRejected`, `undefined` (ignored or declined), or a
 * promise of one.
 */
export function parse<S, M extends Tagged, P, N extends string, K extends N>(
  component: SpecOf<S, M, P, N>,
  name: K,
  input: ParseInput = {},
  options: ParseOptions<NoInfer<S>, NoInfer<P>> = {},
): Parsed<M, K> | IntentRejected | undefined | Promise<Parsed<M, K> | IntentRejected | undefined> {
  const spec = 'spec' in component ? component.spec : component;
  // Widened on purpose: a component without intents may leave `intent` out.
  const parsers = (spec.intent as Readonly<Record<string, unknown>> | undefined) ?? {};
  const parser = parsers[name];
  if (parser === undefined) {
    const known = Object.keys(parsers).join(', ') || 'none';
    throw new Error(`parse: the component has no intent "${name}" (its intents: ${known}).`);
  }
  // `Key: true` declares an intent that just sends its tag.
  if (parser === true) return { _tag: name } as unknown as Parsed<M, K>;
  const { modifiers, ...given } = input;
  if (modifiers !== undefined && given.event !== undefined) {
    throw new Error(
      `parse: "${name}" got both an event and modifiers. Set shiftKey, ctrlKey, altKey or ` +
        'metaKey on your event, or leave the event out and parse() creates one.',
    );
  }
  const props = options.props ?? ({} as P);
  const ctx: ParserCtx<P, S> = {
    props,
    // Sound: initial() only reads init and props, which every spec has.
    state: options.state ?? initial(spec as unknown as ComponentSpec<S, M, P>, props).state,
    read: readerOf(options.stores ?? []),
  };
  // An `on('keydown', …)` parser declares its event type: the event parse() creates has it.
  const type = (parser as { readonly [ON_EVENT]?: string })[ON_EVENT] ?? 'intent';
  const full: IntentInput = {
    name,
    target: undefined as unknown as Element,
    value: undefined,
    checked: undefined,
    formData: undefined,
    detail: undefined,
    key: undefined,
    newState: undefined,
    command: undefined,
    ...given,
    event: given.event ?? eventOf(type, given.key, modifiers ?? {}),
  };
  // Sound: the parser for `name` produces `Parsed<M, K>` (ParserFor, ADR 0023).
  return (parser as (input: IntentInput, ctx: ParserCtx<P, S>) => never)(full, ctx);
}

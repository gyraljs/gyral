import {
  runInit,
  type Command,
  type ComponentSpec,
  type IntentRejected,
  type Next,
  type PropsChanged,
  type Tagged,
} from '@gyral/core';

/** A reducer result, normalised: the new state plus the commands it asked for. */
export interface Stepped<S, M> {
  readonly state: S;
  readonly commands: ReadonlyArray<Command<M>>;
}

/** Any message `update` accepts: the component's own, or a framework message. */
export type StepMessage<M, P> = M | PropsChanged<P> | IntentRejected;

/** Same rule as core's interpreter: state is never an array (ADR 0006). */
function normalise<S, M>(next: Next<S, M>): Stepped<S, M> {
  if (Array.isArray(next) && next.length === 2 && Array.isArray(next[1])) {
    const [state, commands] = next as readonly [S, ReadonlyArray<Command<M>>];
    return { state, commands };
  }
  return { state: next as S, commands: [] };
}

type AnyReducer<S, M, P> = (state: S, msg: Tagged, ctx: { readonly props: P }) => Next<S, M>;

/** Runs `init` without a DOM. `props` defaults to `{}`. */
export function initial<S, M extends Tagged, P>(
  spec: ComponentSpec<S, M, P>,
  props: P = {} as P,
): Stepped<S, M> {
  return normalise(runInit(spec, props));
}

/**
 * Feeds one message through `update` without a DOM. Framework messages (`PropsChanged`,
 * `IntentRejected`) without a reducer leave state unchanged, as in the element.
 */
export function step<S, M extends Tagged, P>(
  spec: ComponentSpec<S, M, P>,
  state: NoInfer<S>,
  // NoInfer: M comes from the spec, so literal messages are checked against it.
  msg: NoInfer<StepMessage<M, P>>,
  props: NoInfer<P> = {} as P,
): Stepped<S, M> {
  // Sound: the reducer is looked up by the message's own tag.
  const reducers = spec.update as unknown as Readonly<
    Record<string, AnyReducer<S, M, P> | undefined>
  >;
  const reducer = reducers[msg._tag];
  if (reducer === undefined) {
    if (msg._tag === 'PropsChanged' || msg._tag === 'IntentRejected') {
      return { state, commands: [] };
    }
    throw new Error(`update has no reducer for message "${msg._tag}"`);
  }
  return normalise(reducer(state, msg, { props }));
}

export interface RunOptions<S, P> {
  readonly props?: P;
  /** Start from this state instead of `init(props)` (whose commands are then skipped). */
  readonly state?: S;
}

export interface Ran<S, M> extends Stepped<S, M> {
  /** State after each message, in order. */
  readonly states: readonly S[];
}

/** Folds messages through `update`, collecting every command (including `init`'s). */
export function run<S, M extends Tagged, P>(
  spec: ComponentSpec<S, M, P>,
  messages: ReadonlyArray<NoInfer<StepMessage<M, P>>>,
  options: NoInfer<RunOptions<S, P>> = {},
): Ran<S, M> {
  const props = options.props ?? ({} as P);
  const start: Stepped<S, M> =
    options.state === undefined ? initial(spec, props) : { state: options.state, commands: [] };
  const commands = [...start.commands];
  const states: S[] = [];
  let state = start.state;
  for (const msg of messages) {
    const next = step(spec, state, msg, props);
    state = next.state;
    commands.push(...next.commands);
    states.push(state);
  }
  return { state, commands, states };
}

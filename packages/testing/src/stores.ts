// Testing helpers for stores (Gyral ADR 0013).
import { type Next, type Store, type Tagged } from '@gyral/core';
import { normalise, type Stepped } from './step.js';

/** Feeds one message through a store's `update` without an instance. */
export function stepStore<S, M extends Tagged>(
  store: Store<S, M>,
  state: NoInfer<S>,
  msg: NoInfer<M>,
): Stepped<S, M> {
  // Sound: the reducer is looked up by the message's own tag.
  const reducers = store.spec.update as unknown as Readonly<
    Record<string, ((state: S, msg: M) => Next<S, M>) | undefined>
  >;
  const reducer = reducers[msg._tag];
  if (reducer === undefined)
    throw new Error(`store "${store.name}" has no reducer for "${msg._tag}"`);
  return normalise(reducer(state, msg));
}

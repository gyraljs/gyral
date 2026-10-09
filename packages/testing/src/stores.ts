// Testing helpers for stores (Gyral ADR 0013).
import { type Command, type Next, type Store, type StoreInstance, type Tagged } from '@gyral/core';
import { STORE_SEND, type StoreSendInput } from '@gyral/core/internal';
import { normalise, type Stepped } from './step.js';

/**
 * A fresh store instance for one test, optionally starting from `initial`. Give it to an
 * element (`el.stores = { [store.name]: instance }`) or to `step(…, [instance])`.
 */
export function testStore<S, M extends Tagged>(
  store: Store<S, M>,
  initial?: NoInfer<S>,
): StoreInstance<S, M> {
  return store.instance(initial);
}

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

/** The messages a reducer's commands `send()` to `store`, in order. */
export function sentTo<S, M extends Tagged>(
  commands: ReadonlyArray<Command<unknown>>,
  store: Store<S, M>,
): M[] {
  return commands
    .filter((c) => c.driver === STORE_SEND)
    .map((c) => c.input as StoreSendInput)
    .filter((input) => input.store.name === store.name)
    .map((input) => input.msg as M);
}

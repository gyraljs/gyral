// Evaluate the pure view with the same named intents and explicit props/store reader as runtime.
import {
  intentsOf,
  type AnyStoreInstance,
  type ChildValue,
  type ComponentSpec,
  type GyralElementClass,
  type Tagged,
} from '@gyral/core';
import { readerOf } from './step.js';

export interface ViewOptions<P> {
  readonly props?: P;
  readonly stores?: readonly AnyStoreInstance[];
}

/**
 * Calls a component's pure view without mounting, a DOM shim or consumer casts. Use
 * `renderToString(viewOf(Component, state, { props, stores }), { dev: false })` for stable
 * HTML assertions. Hooks, native validity, focus and hydration need real-browser tests.
 */
export function viewOf<S, M extends Tagged, P, N extends string>(
  component: ComponentSpec<S, M, P, N> | GyralElementClass<S, M, P, Tagged, N>,
  state: NoInfer<S>,
  options: ViewOptions<NoInfer<P>> = {},
): ChildValue {
  const spec = 'spec' in component ? component.spec : component;
  return spec.view(state, intentsOf<{ readonly intentNames: N }>(), {
    props: options.props ?? ({} as P),
    read: readerOf(options.stores ?? []),
  });
}

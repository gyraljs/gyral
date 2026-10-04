import type { Next } from './command.js';
import type { ComponentSpec, Tagged } from './types.js';

/**
 * Runs a spec's `init`, or starts from `{}` when a stateless component omits it. Used by
 * `define()` and by `@gyral/testing`.
 */
export function runInit<S, M extends Tagged, P>(
  spec: ComponentSpec<S, M, P>,
  props: P,
): Next<S, M> {
  const { init } = spec as { readonly init?: (props: P) => Next<S, M> };
  // Sound: InitField only lets `init` be omitted when `{}` is a valid S.
  return init === undefined ? ({} as S) : init(props);
}

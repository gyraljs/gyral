// Child components: props down, outputs up (docs/design-docs/0010-child-components.md).
import type { Command } from './command.js';
import type { IntentInput, IntentParser, Tagged } from './types.js';

/** Marker driver: `define()` handles emit commands itself, synchronously ordered. */
export const EMIT = {
  name: '@gyral/emit',
  run: () => undefined,
} as const;

/**
 * A command that sends `output` to the parent component. The parent receives it as an
 * intent on the child element: `<my-child data-intent=${i.Picked}>` + `child(MyChild, …)`.
 */
export function emit(output: Tagged & Readonly<Record<string, unknown>>): Command<never> {
  return { driver: EMIT, input: output, onSuccess: () => undefined };
}

/** Anything `child()` can read an output type from: a `define()` class. */
export interface OutputSource<O extends Tagged, E extends Element> {
  new (): E;
  /** Type-only marker for the component's output union. Never set at runtime. */
  readonly outputs?: O;
}

/**
 * Intent parser for a child component's outputs, typed by the child's output union.
 * `el` is the child element, for reading its props (an item id, for example).
 */
export function child<O extends Tagged, E extends Element, M>(
  source: OutputSource<O, E>,
  toMsg: (output: O, el: E) => M | undefined,
): IntentParser<M> {
  return (input: IntentInput) => {
    if (!(input.target instanceof source) || input.detail === undefined) return undefined;
    // Sound: only `emit()` from a component of this class dispatches this detail.
    return toMsg(input.detail as O, input.target);
  };
}

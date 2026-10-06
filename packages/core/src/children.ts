// Child components: props down, outputs up (docs/design-docs/0010-child-components.md).
import type { Command } from './command.js';
import { OUTPUT_EVENT } from './intent.js';
import { defer } from './scheduler.js';
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

/**
 * Sends an output to the parent component. A microtask keeps outputs in order and out of the
 * parent's render pass (settled() waits for it); the event bubbles through the parent's shadow
 * tree only (not composed).
 */
export function dispatchOutput(host: Element, output: unknown): void {
  defer(() => {
    if (!host.isConnected) return;
    host.dispatchEvent(
      new CustomEvent(OUTPUT_EVENT, { detail: output, bubbles: true, composed: false }),
    );
  });
}

/** Anything `child()` can read an output type from: a `define()` class. */
export interface OutputSource<O extends Tagged, E extends Element> {
  new (): E;
  /** Type-only marker for the component's output union. Never set at runtime. */
  readonly outputs?: O;
}

/** A child class, or a function returning it (for recursive or later-defined components). */
export type ChildSource<O extends Tagged, E extends Element> =
  OutputSource<O, E> | (() => OutputSource<O, E>);

// Classes have a prototype; arrow functions (the lazy form) do not.
const resolveSource = <O extends Tagged, E extends Element>(
  source: ChildSource<O, E>,
): OutputSource<O, E> =>
  'prototype' in source && source.prototype !== undefined
    ? (source as OutputSource<O, E>)
    : (source as () => OutputSource<O, E>)();

/**
 * Intent parser for a child component's outputs, typed by the child's output union.
 * `el` is the child element, for reading its props (an item id, for example).
 *
 * Pass `() => Child` when the class isn't defined yet, e.g. a component that contains
 * itself; annotate the constant's type so TypeScript accepts the self-reference:
 *
 *   const Folder: GyralElementClass<State, Msg, Props, Out> = define('x-folder', {
 *     intent: { Child: child(() => Folder, (out, el) => …) }, …
 *   });
 */
export function child<O extends Tagged, E extends Element, M>(
  source: ChildSource<O, E>,
  toMsg: (output: O, el: E) => M | undefined,
): IntentParser<M> {
  return (input: IntentInput) => {
    const type = resolveSource(source); // resolved per event, so the lazy form never hits TDZ
    if (!(input.target instanceof type) || input.detail === undefined) return undefined;
    // Sound: only `emit()` from a component of this class dispatches this detail.
    return toMsg(input.detail as O, input.target);
  };
}

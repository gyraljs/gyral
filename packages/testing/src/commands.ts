import {
  emit,
  focus,
  type AnyDriver,
  type Command,
  type Driver,
  type FocusOptions,
  type OutputsOf,
  type Tagged,
} from '@gyral/core';

type Named = Pick<AnyDriver, 'name'>;

/** The commands addressed to `driver` (matched by name, so fakes and real drivers agree). */
export function commandsFor<I, M>(
  commands: ReadonlyArray<Command<M>>,
  driver: Driver<I, unknown> | Named,
): ReadonlyArray<Command<M> & { readonly input: I }> {
  // Sound: command() built each input for the driver with this name.
  return commands.filter((c) => c.driver.name === driver.name) as ReadonlyArray<
    Command<M> & { readonly input: I }
  >;
}

/** The inputs of the commands addressed to `driver`. */
export function inputsFor<I, M>(
  commands: ReadonlyArray<Command<M>>,
  driver: Driver<I, unknown> | Named,
): readonly I[] {
  return commandsFor(commands, driver).map((c) => c.input);
}

// Core runs emit() and focus() commands itself, with marker drivers it doesn't export: their
// names come from the public builders, so tests never spell them out.
const emitDriver = (): Named => emit({ _tag: 'Probe' }).driver;
const focusDriver = (): Named => focus('*').driver;

/** Anything carrying a component's output union: a `define()` class. */
export interface WithOutputs {
  /** Type-only, as on `GyralElementClass`. */
  readonly outputs?: Tagged;
}

/**
 * The outputs the commands send to the parent component (`emit`, `outputs<O>()`), in order.
 * Pass the component class to type them by its output union (`OutputsOf<typeof Item>`):
 *
 *   expect(outputsIn(next.commands, Item)).toEqual([{ _tag: 'Picked', id: 1 }]);
 */
export function outputsIn<C extends WithOutputs>(
  commands: ReadonlyArray<Command<unknown>>,
  component: C,
): ReadonlyArray<OutputsOf<C>>;
/** The outputs, typed by the union you name: `outputsIn<Out>(commands)`. */
// A type-only argument, like outputs<Out>(): the caller names the union the result holds.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function outputsIn<O extends Tagged = Tagged>(
  commands: ReadonlyArray<Command<unknown>>,
): readonly O[];
// The class only carries the type: the outputs are the emit commands' inputs.
export function outputsIn(commands: ReadonlyArray<Command<unknown>>): readonly Tagged[] {
  // Sound: emit() only accepts tagged outputs; the type parameter names their union.
  return inputsFor<Tagged, unknown>(commands, emitDriver());
}

/** What a `focus()` command asks for: the selector and its options. */
export interface FocusTarget extends FocusOptions {
  readonly selector: string;
}

/**
 * The focus requests among the commands (`focus(selector, options)`), in order:
 *
 *   expect(focusTargetsIn(next.commands)).toEqual([{ selector: '#results' }]);
 */
export function focusTargetsIn(commands: ReadonlyArray<Command<unknown>>): readonly FocusTarget[] {
  return inputsFor<FocusTarget, unknown>(commands, focusDriver());
}

/** The message a command produces if its driver succeeds with `output`. */
export function resolve<M>(command: Command<M>, output: unknown): M | undefined {
  return command.onSuccess(output);
}

/**
 * The message a command produces if its driver fails with `error` (already typed, i.e.
 * after the driver's `toError`). `undefined` when the command has no `onFailure`.
 */
export function reject<M>(command: Command<M>, error: unknown): M | undefined {
  return command.onFailure?.(error);
}

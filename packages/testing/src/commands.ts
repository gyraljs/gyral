import type { AnyDriver, Command, Driver } from '@gyral/core';

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

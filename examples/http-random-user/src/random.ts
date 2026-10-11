// Randomness as an effect: reducers ask for a random number with a command, so models stay pure
// and tests substitute a deterministic driver by name (the "Randomness" recipe in the skill's
// effects-and-drivers reference).
import { command, defineDriver, type Command } from '@gyral/core';

/** Draws `count` numbers in [0, 1). Tests replace it by name (`random`). */
export const randomDriver = defineDriver({
  name: 'random',
  run: ({ count }: { readonly count: number }): readonly number[] =>
    Array.from({ length: count }, () => Math.random()),
});

/** A random integer in [min, max], delivered as a message. */
export function randomInt<M>(min: number, max: number, toMsg: (value: number) => M): Command<M> {
  return command(
    randomDriver,
    { count: 1 },
    { onSuccess: ([u = 0]) => toMsg(min + Math.min(max - min, Math.floor(u * (max - min + 1)))) },
  );
}

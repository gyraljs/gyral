// Randomness as an effect (gyral-czi.10): reducers ask for random numbers with a command,
// so models stay pure and tests substitute a deterministic driver by name.
import { command, defineDriver, type Command, type Driver } from './command.js';

export interface RandomInput {
  /** How many numbers to draw. */
  readonly count: number;
}

/** Uniform numbers in [0, 1). Substitute it in tests: `el.drivers = { random: fake }`. */
export const randomDriver: Driver<RandomInput, readonly number[]> = defineDriver({
  name: 'random',
  run: ({ count }: RandomInput): readonly number[] =>
    Array.from({ length: count }, () => Math.random()),
});

/** Draws `count` uniform numbers in [0, 1) and turns them into a message. */
export function random<M>(
  count: number,
  toMsg: (values: readonly number[]) => M | undefined,
): Command<M> {
  return command(randomDriver, { count }, { onSuccess: toMsg });
}

/** Maps a uniform number in [0, 1) to an integer in `min..max` (inclusive). Pure. */
export const toInt = (u: number, min: number, max: number): number =>
  min + Math.min(max - min, Math.floor(u * (max - min + 1)));

/** Draws one integer in `min..max` (inclusive). */
export function randomInt<M>(
  min: number,
  max: number,
  toMsg: (value: number) => M | undefined,
): Command<M> {
  return random(1, ([u = 0]) => toMsg(toInt(u, min, max)));
}

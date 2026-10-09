// `@gyral/time/delay` (gyral-c5d.15): `delay` and `debounce` for apps that need nothing else
// from @gyral/time. Same signatures, lanes and messages as the main entry's, but their driver
// runs delays only, so periodic ticks and animation frames stay out of the bundle. The driver is
// named `time` like the full one and takes the same input, so substitution (`el.drivers`,
// `provideDrivers`) and virtual time work unchanged, and either driver can stand in for the
// other.
import type { Command } from '@gyral/core';
import type { TimeDriver } from './driver.js';
import { timer, wait, type Lane } from './timer.js';

export type { Lane } from './timer.js';
export type { TimeDriver, TimeInput, TimeOutput } from './driver.js';

/**
 * A time driver for delays only (`{ _tag: 'Delay', ms }`). Periodic and frame inputs reject:
 * they come from the main entry's commands, whose driver runs them.
 */
function makeDelayTime(): TimeDriver {
  return {
    name: 'time',
    run: (input, ctx) =>
      input._tag === 'Delay'
        ? wait(input.ms, ctx.signal)
        : Promise.reject(
            new TypeError(
              `@gyral/time/delay runs delays only; ${input._tag} comes from @gyral/time's driver.`,
            ),
          ),
  };
}

/** The delay-only time driver. */
export const delayTime: TimeDriver = makeDelayTime();

/** Sends `msg` after `ms`. By default every delay runs (`merge` in lane `time:delay`). */
export function delay<M>(ms: number, msg: M, lane: Lane = {}): Command<M> {
  return timer(delayTime, { _tag: 'Delay', ms }, () => msg, lane, {
    key: 'time:delay',
    concurrency: 'merge',
  });
}

/**
 * Sends `msg` once `ms` pass without another `debounce` in the same lane: a delay under
 * `switch`, so each call cancels the pending one.
 */
export function debounce<M>(ms: number, msg: M, key = 'time:debounce'): Command<M> {
  return delay(ms, msg, { key, concurrency: 'switch' });
}

// `@gyral/time`: delays, debounces and wall-clock ticks (`every`) as commands. Delays and
// debounces run on a delay-only driver (delay.ts), `every` on the full one (driver.ts); both are
// named `time`, so tests substitute either by that name, and an app that only delays bundles
// none of the `every` code (gyral-c5d.15, gyral-1zd.24).
import './core.js';
import type { Command } from '@gyral/core';
import { time } from './driver.js';
import { timer } from './timer.js';

export { time } from './driver.js';
export { debounce, delay } from './delay.js';
export type { Frame, TimeDriver, TimeInput, TimeOutput } from './driver.js';
export type { Lane } from './timer.js';

/**
 * Sends `toMsg(now)` at once and then every `ms`, `now` being `Date.now()` (virtual under
 * `virtualTime()`), until it is stopped. Made for `subscriptions` (ADR 0025):
 * `subscriptions: (s) => (s.live ? [every(1000, (now) => ({ _tag: 'Tick', now }))] : [])`.
 * Each `every` runs in lane `key` (`switch`: another one in the same lane replaces it).
 */
export function every<M>(
  ms: number,
  toMsg: (now: number) => M | undefined,
  key = 'time:every',
): Command<M> {
  return timer(
    time,
    { _tag: 'Every', ms },
    (output) => (typeof output === 'number' ? toMsg(output) : undefined),
    {},
    { key, concurrency: 'switch' },
  );
}

// `@gyral/time`: delays, debounces, wall-clock ticks (`every`) and animation frames as commands, run by one
// `time` driver. Apps that only need delays and debounces import them from `@gyral/time/delay`
// instead (delay.ts), whose driver leaves the `every` and frame code out (gyral-c5d.15).
import type { Command } from '@gyral/core';
import { time, type Frame } from './driver.js';
import { timer, type Lane } from './timer.js';

export { time } from './driver.js';
export type { Frame, TimeDriver, TimeInput, TimeOutput } from './driver.js';
export type { Lane } from './timer.js';

/** Sends `msg` after `ms`. By default every delay runs (`merge` in lane `time:delay`). */
export function delay<M>(ms: number, msg: M, lane: Lane = {}): Command<M> {
  return timer(time, { _tag: 'Delay', ms }, () => msg, lane, {
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

/** Streams animation frames until the component disconnects (`switch` in its lane). */
export function animationFrames<M>(
  toMsg: (frame: Frame) => M | undefined,
  lane: Lane = {},
): Command<M> {
  return timer(
    time,
    { _tag: 'Frames' },
    (output) => (typeof output === 'object' ? toMsg(output) : undefined),
    lane,
    { key: 'time:frames', concurrency: 'switch' },
  );
}

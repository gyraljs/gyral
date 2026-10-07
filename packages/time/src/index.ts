import { command, type Command, type Concurrency } from '@gyral/core';
import { time, type Frame, type TimeInput, type TimeOutput } from './driver.js';

export { makeTime, time } from './driver.js';
export type { Frame, TimeDriver, TimeInput, TimeOptions, TimeOutput } from './driver.js';

/** Concurrency lane for a timer. Timers in different lanes run independently. */
export interface Lane {
  /** Lane name. Default: one shared lane per command kind (see each command). */
  readonly key?: string;
  readonly concurrency?: Concurrency;
}

function timer<M>(
  input: TimeInput,
  toMsg: (output: TimeOutput) => M | undefined,
  lane: Lane,
  defaults: Required<Lane>,
): Command<M> {
  return command<TimeInput, TimeOutput, unknown, M>(time, input, {
    onSuccess: toMsg,
    key: lane.key ?? defaults.key,
    concurrency: lane.concurrency ?? defaults.concurrency,
  });
}

/** Sends `msg` after `ms`. By default every delay runs (`merge` in lane `time:delay`). */
export function delay<M>(ms: number, msg: M, lane: Lane = {}): Command<M> {
  return timer({ _tag: 'Delay', ms }, () => msg, lane, {
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
 * Streams the number of elapsed periods (1, 2, 3, …) every `ms` until the component
 * disconnects. Starting another periodic in the same lane replaces it (`switch`).
 */
export function periodic<M>(
  ms: number,
  toMsg: (ticks: number) => M | undefined,
  lane: Lane = {},
): Command<M> {
  return timer(
    { _tag: 'Periodic', ms },
    (output) => (typeof output === 'number' ? toMsg(output) : undefined),
    lane,
    { key: 'time:periodic', concurrency: 'switch' },
  );
}

/** Streams animation frames until the component disconnects (`switch` in its lane). */
export function animationFrames<M>(
  toMsg: (frame: Frame) => M | undefined,
  lane: Lane = {},
): Command<M> {
  return timer(
    { _tag: 'Frames' },
    (output) => (typeof output === 'object' ? toMsg(output) : undefined),
    lane,
    { key: 'time:frames', concurrency: 'switch' },
  );
}

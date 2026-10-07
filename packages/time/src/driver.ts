import type { Driver, DriverContext } from '@gyral/core';
import { abortError, wait } from './timer.js';

/** One animation frame: the rAF timestamp and the time since the previous frame. */
export interface Frame {
  readonly time: number;
  readonly delta: number;
}

export type TimeInput =
  | { readonly _tag: 'Delay'; readonly ms: number }
  | { readonly _tag: 'Periodic'; readonly ms: number }
  | { readonly _tag: 'Frames' };

/** Delays resolve `undefined`; periodic streams tick counts; frames stream `Frame`s. */
export type TimeOutput = undefined | number | Frame;

export type TimeDriver = Driver<TimeInput, TimeOutput>;

export interface TimeOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'time'`. */
  readonly name?: string;
}

/**
 * Runs `start` until the command is aborted, then calls the cleanup `start` returned.
 * Settles only by rejecting on abort: a streaming command (ADR 0006).
 */
function until(signal: AbortSignal, start: () => () => void): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const stop = start();
    signal.addEventListener(
      'abort',
      () => {
        stop();
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}

function periodic(ms: number, { signal, emit }: DriverContext<TimeOutput>): Promise<never> {
  return until(signal, () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      emit(ticks);
    }, ms);
    return () => {
      clearInterval(timer);
    };
  });
}

/** Schedules one frame; returns a cancel function. */
type ScheduleFrame = (callback: (time: number) => void) => () => void;

// requestAnimationFrame where it exists; a ~60 fps timer elsewhere (workers, other runtimes).
const scheduleFrame: ScheduleFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    const id = globalThis.requestAnimationFrame(callback);
    return () => {
      globalThis.cancelAnimationFrame(id);
    };
  }
  const id = setTimeout(() => {
    callback(performance.now());
  }, 16);
  return () => {
    clearTimeout(id);
  };
};

function frames({ signal, emit }: DriverContext<TimeOutput>): Promise<never> {
  return until(signal, () => {
    let previous: number | undefined;
    let cancel: () => void;
    const loop = (time: number): void => {
      emit({ time, delta: previous === undefined ? 0 : time - previous });
      previous = time;
      cancel = scheduleFrame(loop);
    };
    cancel = scheduleFrame(loop);
    return () => {
      cancel();
    };
  });
}

/** A time driver. Nothing starts at import time, so it is safe to load on a server. */
export function makeTime(options: TimeOptions = {}): TimeDriver {
  return {
    name: options.name ?? 'time',
    run: (input, ctx) => {
      switch (input._tag) {
        case 'Delay':
          return wait(input.ms, ctx.signal);
        case 'Periodic':
          return periodic(input.ms, ctx);
        case 'Frames':
          return frames(ctx);
      }
    },
  };
}

/** The default time driver. */
export const time: TimeDriver = makeTime();

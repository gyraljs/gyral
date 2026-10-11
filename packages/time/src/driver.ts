import type { Driver, DriverContext } from '@gyral/core';
import { abortError, wait } from './timer.js';

/** One animation frame: the rAF timestamp and the time since the previous frame. */
export interface Frame {
  readonly time: number;
  readonly delta: number;
}

export type TimeInput =
  | { readonly _tag: 'Delay'; readonly ms: number }
  | { readonly _tag: 'Every'; readonly ms: number }
  | { readonly _tag: 'Frames' };

/** Delays resolve `undefined`; `every` streams wall-clock times (`Date.now()`); frames stream `Frame`s. */
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
    // Starting a stream can emit synchronously, and the receiver may abort in that emit.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- start can abort
    if (signal.aborted) {
      stop();
      reject(abortError(signal));
      return;
    }
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

/** Emits `Date.now()` at once, then every `ms`, until aborted. */
function every(ms: number, { signal, emit }: DriverContext<TimeOutput>): Promise<never> {
  return until(signal, () => {
    emit(Date.now());
    const timer = setInterval(() => {
      emit(Date.now());
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
      if (!signal.aborted) cancel = scheduleFrame(loop);
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
        case 'Every':
          return every(input.ms, ctx);
        case 'Frames':
          return frames(ctx);
      }
    },
  };
}

/** The default time driver. */
export const time: TimeDriver = /* @__PURE__ */ makeTime();

// The scheduler's frame lane (view/04-scheduler.md "Frame lane"): hosts marked by a message
// their spec lists in `renderOnFrame` wait for the next animation frame, then join a microtask
// flush, so many such messages in one frame cost one render. `requestAnimationFrame` doesn't
// run in hidden pages, so a timer runs the frame's flush if no frame came first. Reached
// through core's `#spec-features` (spec-features.ts): compiled builds bundle it only when a
// module names `renderOnFrame` (compiler/features.ts, gyral-c5d.12).
import type { HostTask } from './scheduler.js';

/** A frame-lane flush that no animation frame has run by then runs from a timer (hidden pages). */
const FRAME_FALLBACK_MS = 100;

/** Hosts marked only in the frame lane: they join the scheduler's dirty set when the frame comes. */
const framed = new Set<HostTask>();
let frameRaf = 0;
/** Set while a frame-lane flush is requested. */
let frameTimer: ReturnType<typeof setTimeout> | undefined;

/** The frame lane as the scheduler uses it. */
export interface FrameLane {
  /** Marks `task` for the next frame; then `mark` moves each waiting host to a microtask flush. */
  add(task: HostTask, mark: (task: HostTask) => void): void;
  /** A microtask mark took `task` out of the frame lane. */
  drop(task: HostTask): void;
  /** Hosts are waiting for a frame (settled() waits for them). */
  pending(): boolean;
}

export const frameLane: FrameLane = {
  add(task, mark) {
    framed.add(task);
    if (frameTimer !== undefined) return;
    const run = (): void => {
      cancelAnimationFrame(frameRaf);
      clearTimeout(frameTimer);
      frameTimer = undefined;
      for (const host of framed) mark(host);
    };
    frameRaf = requestAnimationFrame(run);
    frameTimer = setTimeout(run, FRAME_FALLBACK_MS);
  },
  drop(task) {
    framed.delete(task);
  },
  pending: () => framed.size > 0,
};

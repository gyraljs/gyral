// The global scheduler (docs/design-docs/view/04-scheduler.md). Every host's render goes
// through it: reducers run at once, the render waits for one microtask flush shared by the
// whole page. A flush renders dirty hosts parents first (smallest depth, then marking order),
// then runs the post-render queue (focus, custom states, `Hydrated`, deferred init commands),
// and loops until nothing is dirty. Messages a spec lists in `renderOnFrame` mark their host in
// the frame lane instead: it renders in the next animation frame (04 "Frame lane"). It lives
// outside view/ (view/ never imports it) and drives the renderer through view/index.ts.
import { canTransition, startTransition } from './transitions.js';
import { DEV, renderBatch } from './view/index.js';

/** One host as the scheduler sees it. define() creates one per element. */
export interface HostTask {
  /** The component's tag, for errors and the loop guard. */
  readonly tag: string;
  /** Gyral host ancestors in the composed tree, recorded when the host connects. */
  depth: number;
  /** `PropsChanged` (when props changed), then the view and its commit. May throw. */
  readonly render: () => void;
}

/** Post-render phases, run in this order once per pass (04 "Post-render queue"). */
export const POST_FOCUS = 0;
export const POST_STATES = 1;
export const POST_HYDRATED = 2;
export const POST_INIT = 3;

interface PostTask {
  readonly phase: number;
  readonly run: () => void;
}

/** Loop guard (04 "Loop guard"): renders of one host, and passes, in one flush. */
const MAX_RENDERS = 10;
const MAX_PASSES = 100;

const IDLE = 0;
const SCHEDULED = 1;
const TRANSITION = 2;
const FLUSHING = 3;

/** A frame-lane flush that no animation frame has run by then runs from a timer (hidden pages). */
const FRAME_FALLBACK_MS = 100;

const ignore = (): void => undefined;
const dirty = new Set<HostTask>();
/** Hosts marked only in the frame lane: they join `dirty` when the frame comes. */
const framed = new Set<HostTask>();
let frameRaf = 0;
/** Set while a frame-lane flush is requested. */
let frameTimer: ReturnType<typeof setTimeout> | undefined;
let post: PostTask[] = [];
let phase = IDLE;
let transitionWanted = false;
/** Deferred callbacks (outputs to parents) still to run; settled() waits for them. */
let deferred = 0;
let quiet: { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } | null =
  null;

/**
 * True when no host is dirty (in either lane), no flush or transition update is pending and
 * nothing is deferred.
 */
export const isQuiet = (): boolean =>
  phase === IDLE && dirty.size === 0 && framed.size === 0 && deferred === 0;

/** Resolves at the end of the flush that leaves the scheduler quiet. */
export function whenQuiet(): Promise<void> {
  if (isQuiet()) return Promise.resolve();
  if (quiet === null) {
    let resolve: () => void = ignore;
    let reject: (error: unknown) => void = ignore;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    quiet = { promise, resolve, reject };
  }
  return quiet.promise;
}

function schedule(): void {
  if (phase !== IDLE) return;
  phase = SCHEDULED;
  queueMicrotask(start);
}

/**
 * Marks `task` for the next flush: the microtask one, or with `onFrame` the next animation
 * frame's (04 "Frame lane"). Marking an already-dirty host does nothing; a microtask mark moves a
 * host waiting for the frame into the microtask flush. `requestAnimationFrame` doesn't run in
 * hidden pages, so a timer runs the frame's flush if no frame came first.
 */
export function markDirty(task: HostTask, onFrame = false): void {
  if (dirty.has(task)) return;
  if (onFrame) {
    framed.add(task);
    if (frameTimer === undefined) {
      frameRaf = requestAnimationFrame(runFrame);
      frameTimer = setTimeout(runFrame, FRAME_FALLBACK_MS);
    }
    return;
  }
  framed.delete(task);
  dirty.add(task);
  schedule();
}

/** The frame lane's hosts join a microtask flush, which runs right after this callback. */
function runFrame(): void {
  cancelAnimationFrame(frameRaf);
  clearTimeout(frameTimer);
  frameTimer = undefined;
  for (const task of framed) markDirty(task);
}

/** Queues post-render work for the current (or next) flush. */
export function afterRender(phaseOf: number, run: () => void): void {
  post.push({ phase: phaseOf, run });
  schedule();
}

/** A message asked for a view transition: the pending flush runs inside one (04). */
export function requestTransition(): void {
  if (phase === IDLE || phase === SCHEDULED) transitionWanted = true;
}

/** Runs `fn` in a microtask that settled() waits for (outputs sent up to a parent). */
export function defer(fn: () => void): void {
  deferred += 1;
  queueMicrotask(() => {
    try {
      fn();
    } catch (error) {
      console.error('gyral: a deferred callback failed', error);
    } finally {
      deferred -= 1;
      settle();
    }
  });
}

function start(): void {
  if (transitionWanted && canTransition()) {
    phase = TRANSITION;
    startTransition(flush);
  } else {
    flush();
  }
}

/** The dirty host with the smallest depth; ties go to the one marked first. */
function next(): HostTask {
  let best: HostTask | undefined;
  for (const task of dirty) if (best === undefined || task.depth < best.depth) best = task;
  return best as HostTask;
}

class RenderLoop extends Error {}

function renderAll(counts: Map<HostTask, number>): void {
  while (dirty.size > 0) {
    const task = next();
    dirty.delete(task);
    const renders = (counts.get(task) ?? 0) + 1;
    counts.set(task, renders);
    if (renders > MAX_RENDERS) throw loopError(counts);
    try {
      task.render();
    } catch (error) {
      console.error(`<${task.tag}> failed to render; its previous DOM stays.`, error);
    }
  }
}

function runPost(): void {
  const tasks = post.sort((a, b) => a.phase - b.phase); // stable: queue order within a phase
  post = [];
  for (const task of tasks) {
    try {
      task.run();
    } catch (error) {
      console.error('gyral: post-render work failed', error);
    }
  }
}

function loopError(counts: Map<HostTask, number>): RenderLoop {
  const tags = [...new Set([...counts.keys()].map((t) => `<${t.tag}>`))].join(', ');
  return new RenderLoop(
    `gyral: rendering did not settle in one flush (a cycle between ${tags}).` +
      (DEV
        ? ' Components are probably feeding each other props or messages; break the cycle ' +
          'with a condition in update (docs/design-docs/view/04-scheduler.md "Loop guard").'
        : ''),
  );
}

function flush(): void {
  phase = FLUSHING;
  const counts = new Map<HostTask, number>();
  let failure: Error | undefined;
  try {
    renderBatch(() => {
      for (let pass = 1; ; pass++) {
        renderAll(counts);
        if (post.length === 0) return;
        runPost();
        if (dirty.size === 0 && post.length === 0) return;
        if (pass >= MAX_PASSES) throw loopError(counts);
      }
    });
  } catch (error) {
    dirty.clear();
    post = [];
    failure = error instanceof Error ? error : new Error(String(error));
  }
  phase = IDLE;
  transitionWanted = false;
  if (failure === undefined) {
    settle();
  } else if (!DEV) {
    console.error(failure); // production: log and drop the rest, so the page doesn't freeze
    settle();
  } else if (quiet !== null) {
    const waiting = quiet;
    quiet = null;
    waiting.reject(failure);
  } else {
    throw failure;
  }
}

function settle(): void {
  if (quiet === null || !isQuiet()) return;
  const waiting = quiet;
  quiet = null;
  waiting.resolve();
}

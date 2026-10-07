// View Transitions for the scheduler (view/04-scheduler.md "View transitions", ADR 0001
// addendum). An ADR 0003 enhancement: without the API, or with reduced motion requested, the
// flush runs as normal.

interface ViewTransitionLike {
  readonly ready: Promise<unknown>;
  readonly finished: Promise<unknown>;
}

interface ViewTransitionDocument {
  startViewTransition(update: () => void): ViewTransitionLike;
}

const ignore = (): void => undefined;

/** True when a view transition may run now (API present, motion not reduced). */
export const canTransition = (): boolean =>
  'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs `update` (a whole flush) as a view transition's update callback. A transition skipped
 * by a newer one still runs its update (per spec); its rejected promises are expected and
 * swallowed. Call only after `canTransition()`.
 */
export function startTransition(update: () => void): void {
  const transition = (document as Document & ViewTransitionDocument).startViewTransition(update);
  transition.ready.catch(ignore);
  transition.finished.catch(ignore);
}

// View Transitions for the scheduler (view/04-scheduler.md "View transitions", ADR 0001
// addendum). An ADR 0003 enhancement: without the API, or with reduced motion requested, the
// flush runs as normal. Reached through core's `#spec-features` (spec-features.ts): compiled
// builds bundle it only when a module names `viewTransition` (compiler/features.ts,
// gyral-c5d.12).

interface ViewTransitionLike {
  readonly ready: Promise<unknown>;
  readonly finished: Promise<unknown>;
}

interface ViewTransitionDocument {
  startViewTransition(update: () => void): ViewTransitionLike;
}

const ignore = (): void => undefined;

/** True when a view transition may run now (API present, motion not reduced). */
const canTransition = (): boolean =>
  'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs `update` (a whole flush) as a view transition's update callback and returns true, or
 * returns false when no transition may run now (the caller then runs it). A transition skipped
 * by a newer one still runs its update (per spec); its rejected promises are expected and
 * swallowed.
 */
export function startTransition(update: () => void): boolean {
  if (!canTransition()) return false;
  const transition = (document as Document & ViewTransitionDocument).startViewTransition(update);
  transition.ready.catch(ignore);
  transition.finished.catch(ignore);
  return true;
}

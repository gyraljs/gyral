// View Transitions for define() components (ADR 0001 addendum). An ADR 0003 enhancement:
// without the API, or with reduced motion requested, updates render normally.

interface ViewTransitionLike {
  readonly ready: Promise<unknown>;
  readonly finished: Promise<unknown>;
}

interface ViewTransitionDocument {
  startViewTransition(update: () => Promise<void>): ViewTransitionLike;
}

const supportsViewTransitions = (doc: Document): doc is Document & ViewTransitionDocument =>
  'startViewTransition' in doc;

const ignore = (): void => undefined;

/** True when a view transition may run now (API present, motion not reduced). */
export function canTransition(): boolean {
  if (typeof document === 'undefined' || !supportsViewTransitions(document)) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs `update` inside `document.startViewTransition` when allowed, otherwise directly.
 * `update` must resolve once the DOM reflects the new state. The returned promise settles when
 * `update` has run. A transition skipped by a newer one still runs its update (per spec); its
 * rejected `ready` is expected and swallowed.
 */
export function withViewTransition(update: () => Promise<void>): Promise<void> {
  if (!canTransition() || !supportsViewTransitions(document)) return update();
  return new Promise((resolve, reject) => {
    const transition = document.startViewTransition(() => update().then(resolve, reject));
    transition.ready.catch(ignore);
    transition.finished.catch(ignore);
  });
}

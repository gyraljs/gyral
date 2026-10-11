// Collecting the failures Gyral reports (ADR 0024), for browser tests that make a component
// fail on purpose. Gyral reports with `reportError`, which a test runner treats as an uncaught
// error (Vitest fails the run). `collectErrors()` claims them instead: boundary events at the
// document (so no `reportError` follows) and reported errors at `window`.
import { GyralError } from '@gyral/core';

/** The failures collected so far; `stop()` removes the listeners. */
export interface CollectedErrors {
  readonly errors: readonly GyralError[];
  /** Stops collecting; later failures are reported as usual. */
  stop(): void;
}

/**
 * Starts collecting every `GyralError` Gyral reports, so deliberate failures don't fail the
 * test run. Errors that aren't Gyral's are left alone. Call `stop()` when the test ends.
 */
export function collectErrors(): CollectedErrors {
  const errors: GyralError[] = [];
  const claim = (event: Event): void => {
    const error = (event as ErrorEvent).error as unknown;
    if (!(error instanceof GyralError)) return;
    event.preventDefault();
    if (!errors.includes(error)) errors.push(error);
  };
  // Capture at the document: claimed before any ancestor boundary, so no reportError follows.
  document.addEventListener('error', claim, true);
  // Failures without a host (stores, shared work) reach window through reportError.
  window.addEventListener('error', claim);
  return {
    errors,
    stop() {
      document.removeEventListener('error', claim, true);
      window.removeEventListener('error', claim);
    },
  };
}

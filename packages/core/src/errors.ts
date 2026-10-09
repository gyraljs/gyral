// Errors (ADR 0024): one reporting channel. Every failure Gyral catches becomes a `GyralError`
// carrying the component, the phase and the message, and goes through `fail()`: the devtools
// timeline, then a bubbling, composed, cancelable `ErrorEvent('error')` on the failing host
// (a parent claims it with `preventDefault()`), then `reportError()` unless it was claimed, so
// `window` `error` listeners and monitoring tools see it. The boundary event stops at the
// document, so `window` gets each failure once, from `reportError`.
import { DEVTOOLS_ENABLED, devError } from '#devtools';

/** Where a failure happened. */
export type ErrorPhase =
  'init' | 'update' | 'view' | 'parse' | 'command' | 'hook' | 'store' | 'subscribe';

/** A failure Gyral caught, with its context; `cause` is what was thrown. */
export class GyralError extends Error {
  override readonly name = 'GyralError';
  /** The failing host's tag; `undefined` for a store or work not tied to one component. */
  readonly component: string | undefined;
  readonly phase: ErrorPhase;
  /** The message tag being reduced, the intent name, or the driver's name. */
  readonly msg: string | undefined;

  constructor(phase: ErrorPhase, text: string, cause: unknown, component?: string, msg?: string) {
    super(text, { cause });
    this.phase = phase;
    this.component = component;
    this.msg = msg;
  }
}

/** Where a failure happened, for `fail()`. */
export interface FailureSite {
  /** The failing host: it gets the boundary event. */
  readonly host?: Element | undefined;
  readonly tag?: string | undefined;
  readonly msg?: string | undefined;
}

let stopping = false;

/** Reports `cause` (ADR 0024 "Recommendation"); returns the GyralError it reported. */
export function fail(
  cause: unknown,
  phase: ErrorPhase,
  text: string,
  site: FailureSite = {},
): GyralError {
  const { host, tag, msg } = site;
  const error = cause instanceof GyralError ? cause : new GyralError(phase, text, cause, tag, msg);
  if (DEVTOOLS_ENABLED) devError(host, error);
  let claimed = false;
  if (host?.isConnected === true) {
    if (!stopping) {
      // The boundary event ends at the document: `window` hears the failure from reportError.
      stopping = true;
      document.addEventListener('error', (event) => {
        if (event.error instanceof GyralError) event.stopPropagation();
      });
    }
    claimed = !host.dispatchEvent(
      new ErrorEvent('error', {
        error,
        message: error.message,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  }
  if (!claimed) reportError(error); // Baseline widely available since 2024-09 (ADR 0024)
  return error;
}

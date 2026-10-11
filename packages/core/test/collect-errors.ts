// Collects what Gyral reports (ADR 0024) in these tests: GyralErrors claimed at the document (no
// reportError follows) and those reported to window. @gyral/testing's collectErrors() does the
// same for apps; this copy uses this package's own GyralError class.
import { GyralError } from '../src/index.js';

export interface Collected {
  readonly errors: GyralError[];
  /** Each error's message and its cause, one per line, for matching. */
  text(): string;
  stop(): void;
}

export function collectErrors(): Collected {
  const errors: GyralError[] = [];
  const claim = (event: Event): void => {
    const error = (event as ErrorEvent).error as unknown;
    if (!(error instanceof GyralError)) return;
    event.preventDefault();
    if (!errors.includes(error)) errors.push(error);
  };
  document.addEventListener('error', claim, true);
  window.addEventListener('error', claim);
  return {
    errors,
    text: () => errors.map((e) => `${e.message} ${String(e.cause)}`).join('\n'),
    stop() {
      document.removeEventListener('error', claim, true);
      window.removeEventListener('error', claim);
    },
  };
}

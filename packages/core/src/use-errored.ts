// Registers the `Errored` message in a compiled build (ADR 0024, gyral-1zd.17). Only the module
// the build adds for a module that names `Errored` imports it (compiler/features.ts).
import { useErrored } from '#spec-features';
import { sendErrored } from './error-view.js';

/** Called once by the added module, before any module that handles the message runs. */
export function register(): void {
  useErrored(sendErrored);
}

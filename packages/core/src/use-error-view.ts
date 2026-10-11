// Registers the `error` fallback view in a compiled build (ADR 0024, gyral-1zd.17). Only the
// module the build adds for a module that names `error` imports it (compiler/features.ts).
import { useErrorView } from '#spec-features';
import { renderErrorView } from './error-view.js';

/** Called once by the added module, before any module that names the field runs. */
export function register(): void {
  useErrorView(renderErrorView);
}

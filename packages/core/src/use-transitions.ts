// Registers startTransition in a compiled build (gyral-c5d.12). Only the module the build adds for a
// module that names the spec field imports it (compiler/features.ts), so other builds leave
// transitions.ts out.
import { useViewTransitions } from '#spec-features';
import { startTransition } from './transitions.js';

/** Called once by the added module, before any module that names the field runs. */
export function register(): void {
  useViewTransitions(startTransition);
}

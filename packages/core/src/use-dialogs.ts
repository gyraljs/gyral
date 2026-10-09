// Registers the dialog and popover bindings in a compiled build (gyral-1zd.27). Only the module
// the build adds for a module that writes `?modal=` or `?popover-open=` imports it
// (compiler/features.ts), so other builds leave modal.ts out.
import { applyToggle, useToggles } from './view/index.js';

/** Called once by the added module, before any module that uses the bindings runs. */
export function register(): void {
  useToggles(applyToggle);
}

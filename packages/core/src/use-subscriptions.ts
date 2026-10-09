// Registers subscriptionSet in a compiled build (ADR 0025). Only the module the build adds for a
// module that names the spec field imports it (compiler/features.ts), so other builds leave
// subscriptions.ts out.
import { useSubscriptions } from '#spec-features';
import { subscriptionSet } from './subscriptions.js';

/** Called once by the added module, before any module that names the field runs. */
export function register(): void {
  useSubscriptions(subscriptionSet);
}

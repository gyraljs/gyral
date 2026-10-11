// Registers the invoker-command fallback in a client-only build (gyral-c5d.11). Only the module
// the build adds for a module that may use command intents imports it (compiler/features.ts,
// `virtual:gyral-use/invokers`), so only those builds carry the fallback's import().
import { useInvokerShim } from '#invoker-fallback';
import { loadInvokerShim } from './invoker-fallback.js';

/** Called once by the added module, before any module that may need the fallback runs. */
export function register(): void {
  useInvokerShim(loadInvokerShim);
}

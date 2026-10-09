// Registers hook disposal in a compiled build (gyral-1zd.24). Only the module the build adds for
// a module that names `dispose` imports it (compiler/features.ts), so apps whose hooks have no
// teardown leave dispose.ts out.
import { commitTracked, useDisposableHooks } from './view/index.js';

/** Called once by the added module, before any module that defines such a hook runs. */
export function register(): void {
  useDisposableHooks(commitTracked);
}

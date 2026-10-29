// Gyral's packages use core's internals, so each runs only with the core of its own release
// (ADR 0033, gyral-337.5). They take core as an exact-version peer, so a package manager never
// installs a second copy for them, and each calls `requireCore` when it loads.
import { DEV, message } from './view/index.js';
import { VERSION } from './view/version.js';

/**
 * For a Gyral package (`@gyral/http`, its `version`): development throws G0016 when this core
 * is another release, production warns with the code.
 */
export function requireCore(pkg: string, version: string): void {
  if (version === VERSION) return;
  const text = message(16, pkg, version, VERSION);
  if (DEV) throw new Error(text);
  console.warn(text);
}

// Production build of the devtools hook (ADR 0017): the same names as devtools.ts, doing
// nothing. Call sites guard with DEVTOOLS_ENABLED, a literal `false` here, so bundlers drop
// them entirely. The `typeof Dev.x` annotations keep both modules' signatures in sync.
import type * as Dev from './devtools.js';

export const DEVTOOLS_ENABLED: boolean = false;

const noop = (): void => undefined;

export const devConnect: typeof Dev.devConnect = noop;
export const devUpdate: typeof Dev.devUpdate = noop;
export const devHydrated: typeof Dev.devHydrated = noop;
export const devStore: typeof Dev.devStore = noop;
export const devCommands: typeof Dev.devCommands = () => noop;
export const devOwner: typeof Dev.devOwner = () => '';

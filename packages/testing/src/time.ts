import { install } from '@sinonjs/fake-timers';

/** Controls time in a test. Always `restore()` (for example in `afterEach`). */
export interface VirtualTime {
  /** Advances the clock, running due timers and the promise work between them. */
  advance(ms: number): Promise<void>;
  /** Runs every pending timer (and timers they schedule) until none remain. */
  runAll(): Promise<void>;
  /** Current virtual time in ms (`Date.now()` while installed). */
  now(): number;
  restore(): void;
}

/**
 * Replaces timers and `Date` with a virtual clock (ADR 0006, "Testing"). It patches the
 * platform rather than Gyral's runtime, so it covers drivers, debounces and retry delays
 * alike and does not depend on how the interpreter is implemented. Microtasks stay real,
 * so promises and the runtime keep working.
 */
export function virtualTime(): VirtualTime {
  const clock = install({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  return {
    advance: async (ms) => {
      await clock.tickAsync(ms);
    },
    runAll: async () => {
      await clock.runAllAsync();
    },
    now: () => clock.now,
    restore: () => {
      clock.uninstall();
    },
  };
}

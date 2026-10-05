// The devtools event stream (ADR 0017). Types and the global hook name only: the emitting code
// lives in devtools.ts (development builds) and devtools-off.ts (production builds).
import type { Concurrency } from './command.js';
import type { Tagged } from './types.js';

/** Where a listener installs itself: `globalThis.__GYRAL_DEVTOOLS__ = { emit }`. */
export const DEVTOOLS_GLOBAL = '__GYRAL_DEVTOOLS__';

/** A live component, identified for the timeline. `element` gives the panel its state. */
export interface DevComponentRef {
  readonly tag: string;
  readonly id: number;
  readonly element: Element;
}

export type CommandPhase = 'issued' | 'dropped' | 'settled' | 'failed' | 'interrupted';

/** What the interpreter reports about one command (ADR 0006 lanes and policies). */
export interface CommandTraceEvent {
  readonly phase: CommandPhase;
  readonly driver: string;
  readonly lane: string;
  readonly policy: Concurrency;
  readonly input: unknown;
  /** Driver output (`settled`) or error (`failed`). */
  readonly result?: unknown;
}

export type CommandTrace = (event: CommandTraceEvent) => void;

export type DevEvent = { readonly at: number } & (
  | { readonly kind: 'connect' | 'disconnect'; readonly component: DevComponentRef }
  | {
      readonly kind: 'update';
      readonly component: DevComponentRef;
      readonly msg: Tagged;
      readonly prev: unknown;
      readonly next: unknown;
    }
  | {
      readonly kind: 'hydrated';
      readonly component: DevComponentRef;
      readonly serverRendered: boolean;
    }
  | ({ readonly kind: 'command'; readonly owner: string } & CommandTraceEvent)
  | {
      readonly kind: 'store';
      readonly store: string;
      readonly msg: Tagged;
      readonly prev: unknown;
      readonly next: unknown;
    }
);

/** Installed by a devtools panel (or a test) on `globalThis[DEVTOOLS_GLOBAL]`. */
export interface DevtoolsHook {
  emit(event: DevEvent): void;
}

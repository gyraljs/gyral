import type { Head } from '@gyral/core';
import type { RouteLocation } from './stream.js';

/** What the browser history does once a navigation's render has committed (ADR 0009). */
export interface AfterNavigation {
  /** Scroll to the `#fragment` target or the top (push, replace), or restore (back/forward). */
  readonly scroll: boolean;
  /** Move focus to the first `[autofocus]` element, or reset it to the page start. */
  readonly focusReset: boolean;
}

/** What the driver needs from a history (browser or memory). */
export interface Source {
  subscribe(emit: (location: RouteLocation) => void, signal: AbortSignal): Promise<never>;
  navigate(
    url: string,
    replace: boolean,
    after?: Partial<AfterNavigation>,
  ): RouteLocation | Promise<RouteLocation> | undefined;
  traverse(delta: number): void;
  setHead(head: Head): void;
  snapshot(): RouterSnapshot;
  dispose(): void;
}

/** The router's current URL and last head, for tests and server-side assertions. */
export interface RouterSnapshot {
  readonly href: string;
  /** The last `setHead()` head, if any (the browser applies it to the document too). */
  readonly head: Head | undefined;
  /** Number of history entries (memory history; `history.length` in a browser). */
  readonly length: number;
}

import type { RouteLocation } from './stream.js';

/** What the driver needs from a history (browser or memory). */
export interface Source {
  subscribe(emit: (location: RouteLocation) => void, signal: AbortSignal): Promise<never>;
  navigate(url: string, replace: boolean): RouteLocation | Promise<RouteLocation> | undefined;
  traverse(delta: number): void;
  setTitle(title: string): void;
  snapshot(): RouterSnapshot;
  dispose(): void;
}

/** The router's current URL and title, for tests and server-side assertions. */
export interface RouterSnapshot {
  readonly href: string;
  readonly title: string;
  /** Number of history entries (memory history; `history.length` in a browser). */
  readonly length: number;
}

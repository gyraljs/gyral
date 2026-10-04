// The location stream shared by the browser and memory histories (ADR 0009).

/** The document location, numbered in the order this router saw changes. */
export interface RouteLocation {
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  /** Increases on every URL change seen by this router. */
  readonly seq: number;
}

/** What link capture and URL resolution need from a location (a `URL` qualifies). */
export type LocationLike = Pick<Location, 'href' | 'origin' | 'pathname' | 'search'>;

export interface LocationStream {
  readonly current: () => RouteLocation;
  /** Re-reads the location and delivers it to every subscriber. */
  readonly notify: () => void;
  /** Emits the current location, then every change, until `signal` aborts. */
  readonly subscribe: (
    emit: (location: RouteLocation) => void,
    signal: AbortSignal,
  ) => Promise<never>;
  readonly clear: () => void;
}

export function locationStream(
  read: () => LocationLike & { readonly hash: string },
): LocationStream {
  let seq = 0;
  const snapshot = (): RouteLocation => {
    const { href, pathname, search, hash } = read();
    return { href, pathname, search, hash, seq };
  };
  let current = snapshot();
  const subscribers = new Set<(location: RouteLocation) => void>();

  return {
    current: () => current,
    notify: () => {
      seq += 1;
      current = snapshot();
      for (const deliver of [...subscribers]) deliver(current);
    },
    subscribe: (emit, signal) =>
      new Promise<never>((_resolve, reject) => {
        const abort = (): void => {
          subscribers.delete(emit);
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          abort();
          return;
        }
        subscribers.add(emit);
        signal.addEventListener('abort', abort, { once: true });
        emit(current);
      }),
    clear: () => {
      subscribers.clear();
    },
  };
}

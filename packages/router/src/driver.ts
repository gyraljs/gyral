import type { Driver } from '@gyral/core';
import { capturedUrl } from './links.js';

/** The document location, numbered so a re-armed `listen` never misses a change. */
export interface RouteLocation {
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  /** Increases on every URL change seen by this router. */
  readonly seq: number;
}

export type RouterInput =
  | { readonly _tag: 'Navigate'; readonly url: string; readonly replace: boolean }
  | { readonly _tag: 'Traverse'; readonly delta: number }
  | { readonly _tag: 'Listen'; readonly since: number };

export interface RouterOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'router'`. */
  readonly name?: string;
  /** Default: the global window, resolved on first use (safe to import on a server). */
  readonly window?: Window;
  /** Use the Navigation API when present. Default `true`; `false` forces the History API. */
  readonly navigationApi?: boolean;
  /** Intercept same-origin link clicks. Default `true`. */
  readonly captureLinks?: boolean;
}

export interface RouterDriver extends Driver<RouterInput, RouteLocation | undefined> {
  /** Removes listeners and rejects pending `listen` commands. */
  readonly dispose: () => void;
}

// Minimal Navigation API shapes; it is not Baseline widely available (ADR 0003).
interface NavigationLike extends EventTarget {
  navigate(
    url: string,
    options: { history: 'push' | 'replace'; info: unknown },
  ): { committed: Promise<unknown>; finished: Promise<unknown> };
}
interface NavigateEventLike extends Event {
  readonly canIntercept: boolean;
  readonly info: unknown;
  intercept(): void;
}

interface Source {
  wait(since: number, signal: AbortSignal): Promise<RouteLocation>;
  navigate(url: string, replace: boolean): RouteLocation | Promise<RouteLocation> | undefined;
  traverse(delta: number): void;
  dispose(): void;
}

function createSource(options: RouterOptions): Source {
  const win = options.window ?? window;
  const nav =
    options.navigationApi === false
      ? undefined
      : (win as { navigation?: NavigationLike }).navigation;
  // Identifies navigations this router started, so only those are intercepted.
  const token = {};
  let seq = 0;
  const read = (): RouteLocation => {
    const { href, pathname, search, hash } = win.location;
    return { href, pathname, search, hash, seq };
  };
  let current = read();
  const waiters = new Set<(location: RouteLocation) => void>();

  const notify = (): void => {
    seq += 1;
    current = read();
    const ready = [...waiters];
    waiters.clear();
    for (const resolve of ready) resolve(current);
  };

  const navigate = (url: string, replace: boolean) => {
    const target = new URL(url, win.location.href);
    if (target.origin !== win.location.origin) {
      win.location.assign(target.href);
      return undefined;
    }
    if (nav !== undefined) {
      const result = nav.navigate(target.href, {
        history: replace ? 'replace' : 'push',
        info: token,
      });
      result.finished.catch(() => undefined); // superseded navigations reject; that's fine
      return result.committed.then(() => current);
    }
    if (replace) win.history.replaceState(null, '', target.href);
    else win.history.pushState(null, '', target.href);
    notify();
    return current;
  };

  const onNavigate = (event: Event): void => {
    const e = event as NavigateEventLike;
    if (e.info === token && e.canIntercept) e.intercept(); // keep it same-document
  };
  const onClick = (event: MouseEvent): void => {
    const url = capturedUrl(event, win.location);
    if (url === undefined) return;
    event.preventDefault();
    void Promise.resolve(navigate(url.href, false)).catch((error: unknown) => {
      console.error('gyral router: navigation failed', error);
    });
  };

  if (nav === undefined) {
    win.addEventListener('popstate', notify);
  } else {
    nav.addEventListener('navigate', onNavigate);
    nav.addEventListener('currententrychange', notify);
  }
  if (options.captureLinks !== false) win.document.addEventListener('click', onClick);

  return {
    wait: (since, signal) => {
      if (since < current.seq) return Promise.resolve(current);
      return new Promise((resolve, reject) => {
        const done = (location: RouteLocation): void => {
          signal.removeEventListener('abort', abort);
          resolve(location);
        };
        const abort = (): void => {
          waiters.delete(done);
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          abort();
          return;
        }
        waiters.add(done);
        signal.addEventListener('abort', abort, { once: true });
      });
    },
    navigate,
    traverse: (delta) => {
      win.history.go(delta);
    },
    dispose: () => {
      win.removeEventListener('popstate', notify);
      nav?.removeEventListener('navigate', onNavigate);
      nav?.removeEventListener('currententrychange', notify);
      win.document.removeEventListener('click', onClick);
      waiters.clear();
    },
  };
}

/** A router driver. Listeners are installed on first use, never at import time. */
export function makeRouter(options: RouterOptions = {}): RouterDriver {
  let source: Source | undefined;
  const use = (): Source => (source ??= createSource(options));
  return {
    name: options.name ?? 'router',
    run: (input, { signal }) => {
      switch (input._tag) {
        case 'Listen':
          return use().wait(input.since, signal);
        case 'Navigate':
          return use().navigate(input.url, input.replace);
        case 'Traverse':
          use().traverse(input.delta);
          return undefined;
      }
    },
    dispose: () => {
      source?.dispose();
      source = undefined;
    },
  };
}

/** The default router (global window, Navigation API when available). */
export const router: RouterDriver = makeRouter();

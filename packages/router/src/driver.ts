import type { Driver } from '@gyral/core';
import { capturedUrl } from './links.js';
import { createMemorySource, type MemoryOptions } from './memory.js';
import type { RouterSnapshot, Source } from './source.js';
import { locationStream, type RouteLocation } from './stream.js';

export type { RouteLocation } from './stream.js';
export type { RouterSnapshot } from './source.js';

export type RouterInput =
  | { readonly _tag: 'Navigate'; readonly url: string; readonly replace: boolean }
  | { readonly _tag: 'Traverse'; readonly delta: number }
  | { readonly _tag: 'Title'; readonly title: string }
  | { readonly _tag: 'Listen' };

export interface RouterOptions extends MemoryOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'router'`. */
  readonly name?: string;
  /**
   * `'browser'` (default) drives the real document. `'memory'` keeps entries in memory: no
   * global URL changes, no `window` needed (tests, servers). See `initial`, `origin`, `linkRoot`.
   */
  readonly history?: 'browser' | 'memory';
  /** Browser history: default the global window, resolved on first use (safe on a server). */
  readonly window?: Window;
  /** Browser history: use the Navigation API when present. Default `true`. */
  readonly navigationApi?: boolean;
}

export interface RouterDriver extends Driver<RouterInput, RouteLocation | undefined> {
  /** The current URL and title as this router sees them. */
  readonly snapshot: () => RouterSnapshot;
  /** Removes document listeners and ends running `listen` commands. */
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

function createBrowserSource(options: RouterOptions): Source {
  const win = options.window ?? window;
  const nav =
    options.navigationApi === false
      ? undefined
      : (win as { navigation?: NavigationLike }).navigation;
  // Identifies navigations this router started, so only those are intercepted.
  const token = {};
  const stream = locationStream(() => win.location);

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
      return result.committed.then(() => stream.current());
    }
    if (replace) win.history.replaceState(null, '', target.href);
    else win.history.pushState(null, '', target.href);
    stream.notify();
    return stream.current();
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
    win.addEventListener('popstate', stream.notify);
  } else {
    nav.addEventListener('navigate', onNavigate);
    nav.addEventListener('currententrychange', stream.notify);
  }
  if (options.captureLinks === true) win.document.addEventListener('click', onClick);

  return {
    subscribe: stream.subscribe,
    navigate,
    traverse: (delta) => {
      win.history.go(delta);
    },
    setTitle: (title) => {
      win.document.title = title;
    },
    snapshot: () => ({
      href: win.location.href,
      title: win.document.title,
      length: win.history.length,
    }),
    dispose: () => {
      win.removeEventListener('popstate', stream.notify);
      nav?.removeEventListener('navigate', onNavigate);
      nav?.removeEventListener('currententrychange', stream.notify);
      win.document.removeEventListener('click', onClick);
      stream.clear();
    },
  };
}

/** A router driver. Listeners are installed on first use, never at import time. */
export function makeRouter(options: RouterOptions = {}): RouterDriver {
  let source: Source | undefined;
  const use = (): Source =>
    (source ??=
      options.history === 'memory' ? createMemorySource(options) : createBrowserSource(options));
  return {
    name: options.name ?? 'router',
    run: (input, { signal, emit }) => {
      switch (input._tag) {
        case 'Listen':
          return use().subscribe(emit, signal);
        case 'Navigate':
          return use().navigate(input.url, input.replace);
        case 'Traverse':
          use().traverse(input.delta);
          return undefined;
        case 'Title':
          use().setTitle(input.title);
          return undefined;
      }
    },
    snapshot: () => use().snapshot(),
    dispose: () => {
      source?.dispose();
      source = undefined;
    },
  };
}

/** The default router (global window, Navigation API when available). */
export const router: RouterDriver = makeRouter();

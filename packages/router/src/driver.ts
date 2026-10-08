import type { Driver } from '@gyral/core';
import { capturedUrl, linkCapture } from './links.js';
import { createMemorySource, type MemoryOptions } from './memory.js';
import { rendered } from './internal/rendered.js';
import type { HistoryPath } from './internal/history.js';
import type { AfterNavigation, RouterSnapshot, Source } from './source.js';
import { locationStream, type RouteLocation } from './stream.js';

export type { RouteLocation } from './stream.js';
export type { RouterSnapshot } from './source.js';

export type { AfterNavigation } from './source.js';

export type RouterInput =
  | ({
      readonly _tag: 'Navigate';
      readonly url: string;
      readonly replace: boolean;
    } & Partial<AfterNavigation>)
  | { readonly _tag: 'Traverse'; readonly delta: number }
  | { readonly _tag: 'Title'; readonly title: string }
  | { readonly _tag: 'Listen' };

export interface RouterOptions extends MemoryOptions {
  /** Driver name used for substitution (`el.drivers`). Default `'router'`. */
  readonly name?: string;
  /**
   * `'browser'` (default) drives the real document. `'memory'` keeps entries in memory: no
   * global URL changes, no `window` needed (tests, servers). See `initial` and `origin`.
   * `captureLinks`/`linkRoot` apply to both histories.
   */
  readonly history?: 'browser' | 'memory';
  /** Browser history: default the global window, resolved on first use (safe on a server). */
  readonly window?: Window;
  /** Browser history: use the Navigation API when present. Default `true`. */
  readonly navigationApi?: boolean;
  /**
   * Browser history, once a navigation has rendered: scroll to the `#fragment` target or the
   * top (push, replace) and restore the position on back/forward. Default `true`; `false` for
   * apps that manage scroll themselves. `navigate(url, { scroll })` overrides it per call.
   */
  readonly scroll?: boolean;
  /**
   * Browser history, once a navigation has rendered: move focus to the first `[autofocus]`
   * element, or reset it to the page start, unless something took focus during the navigation
   * (a `focus('main h1')` command). Default `true`. `navigate(url, { focusReset })` per call.
   */
  readonly focusReset?: boolean;
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
  readonly navigationType: string;
  readonly hashChange: boolean;
  intercept(options: {
    handler: () => Promise<void>;
    scroll: 'after-transition' | 'manual';
    focusReset: 'after-transition' | 'manual';
  }): void;
}

function createBrowserSource(options: RouterOptions): Source {
  const win = options.window ?? window;
  const nav =
    options.navigationApi === false
      ? undefined
      : (win as { navigation?: NavigationLike }).navigation;
  const stream = locationStream(() => win.location);
  const what = (asked: Partial<AfterNavigation> = {}): AfterNavigation => ({
    scroll: asked.scroll ?? options.scroll ?? true,
    focusReset: asked.focusReset ?? options.focusReset ?? true,
  });
  // Navigation API: the `info` of each navigation this router started, so only those (and
  // same-document traversals) are intercepted, with that navigation's scroll/focus choice.
  const started = new WeakMap<object, AfterNavigation>();
  // History API path (ADR 0003 tier 3): loaded only without the Navigation API.
  const history: Promise<HistoryPath> | undefined =
    nav === undefined
      ? import('./internal/history.js').then((m) => m.historyPath(win, stream, what, rendered))
      : undefined;

  const navigate = (url: string, replace: boolean, asked?: Partial<AfterNavigation>) => {
    const target = new URL(url, win.location.href);
    if (target.origin !== win.location.origin) {
      win.location.assign(target.href);
      return undefined;
    }
    if (nav !== undefined) {
      const info = {};
      started.set(info, what(asked));
      const result = nav.navigate(target.href, { history: replace ? 'replace' : 'push', info });
      result.finished.catch(() => undefined); // superseded navigations reject; that's fine
      return result.committed.then(() => stream.current());
    }
    return history?.then((path) => {
      path.navigate(target, replace, what(asked));
      return stream.current();
    });
  };

  const onNavigate = (event: Event): void => {
    const e = event as NavigateEventLike;
    if (!e.canIntercept) return;
    const asked = typeof e.info === 'object' && e.info !== null ? started.get(e.info) : undefined;
    // Ours: keep it same-document. A same-document traversal: restore scroll after the render.
    const after = asked ?? (e.navigationType === 'traverse' && !e.hashChange ? what() : undefined);
    if (after === undefined) return;
    e.intercept({
      handler: rendered,
      scroll: after.scroll ? 'after-transition' : 'manual',
      focusReset: after.focusReset ? 'after-transition' : 'manual',
    });
  };
  const onClick = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    const url = capturedUrl(event, win.location);
    if (url === undefined) return;
    event.preventDefault();
    void Promise.resolve(navigate(url.href, false)).catch((error: unknown) => {
      console.error('gyral router: navigation failed', error);
    });
  };

  nav?.addEventListener('navigate', onNavigate);
  nav?.addEventListener('currententrychange', stream.notify);
  const linkRoot =
    options.linkRoot === undefined
      ? options.captureLinks === true
        ? win.document
        : undefined
      : (options.linkRoot ?? undefined);
  // Only while a component listens (gyral-ud5.10): a leftover router never claims clicks.
  const capture = linkCapture(linkRoot, onClick);

  return {
    subscribe: capture.track(stream.subscribe),
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
      void history?.then((path) => {
        path.dispose();
      });
      nav?.removeEventListener('navigate', onNavigate);
      nav?.removeEventListener('currententrychange', stream.notify);
      capture.dispose();
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
          return use().navigate(input.url, input.replace, input);
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

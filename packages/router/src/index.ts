import './core.js';
import { command, type Command, type Head } from '@gyral/core';
import { router, type AfterNavigation, type RouteLocation, type RouterInput } from './driver.js';
import { applyHead } from './internal/head.js';
import { headSlot } from './internal/head-slot.js';

export { makeRouter, router } from './driver.js';
export type {
  AfterNavigation,
  RouteLocation,
  RouterDriver,
  RouterInput,
  RouterOptions,
  RouterSnapshot,
} from './driver.js';
export type { MemoryOptions } from './memory.js';
export type { LocationLike } from './stream.js';
export { routes } from './routes.js';
export type { Matcher, Params, RouteMatch, RouteTable, Routes } from './routes.js';

const fireAndForget = (input: RouterInput): Command<never> => command(router, input);

/** Options of `navigate()`. */
export interface NavigateOptions extends Partial<AfterNavigation> {
  /** Replace the current history entry instead of pushing one. Default `false`. */
  readonly replace?: boolean;
}

/**
 * Navigates in-app (pushes a history entry, or replaces the current one). In the browser, once
 * the new page has rendered, a push scrolls to the `#fragment` target or the top and resets
 * focus, as the browser does for a page load (ADR 0009 "Scroll and focus"); `scroll: false` or
 * `focusReset: false` leaves that to the app. A `replace` (keeping the query in sync with a
 * search box) leaves scroll and focus alone unless `scroll: true` / `focusReset: true`.
 */
export function navigate(url: string, options: NavigateOptions = {}): Command<never> {
  return fireAndForget({ _tag: 'Navigate', url, ...options, replace: options.replace ?? false });
}

/**
 * Makes the document's head this `Head` (ADR 0019): the title, `lang`/`dir`, and every managed
 * element (description, robots, canonical, meta, links, JSON-LD). Managed elements the new head
 * doesn't name are removed; unchanged ones are not written; content from `renderPage({ extraHead })`
 * is never touched. The memory history records it instead. Build the head with one pure
 * function and pass the same function's result to the server's `renderPage()`:
 *
 *   Routed: (s, m) => [next, [setHead(pageHead(site.match(m.location.href), origin))]]
 */
export function setHead(head: Head): Command<never> {
  headSlot.apply ??= applyHead;
  return fireAndForget({ _tag: 'Head', head });
}

/**
 * Streams the current location, then every URL change, as messages until the component
 * disconnects (a streaming command, ADR 0006/0009). Start it from `subscriptions`, which restarts
 * it when a moved or re-attached component connects again (a command from `init` is not):
 *
 *   subscriptions: () => [listen((location) => ({ _tag: 'Routed', location }))]
 */
export function listen<M>(toMsg: (location: RouteLocation) => M | undefined): Command<M> {
  return command(
    router,
    { _tag: 'Listen' },
    {
      onSuccess: (location) => (location === undefined ? undefined : toMsg(location)),
      key: 'router:listen',
      concurrency: 'switch',
    },
  );
}

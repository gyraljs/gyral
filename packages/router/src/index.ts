import { command, type Command } from '@gyral/core';
import { router, type RouteLocation, type RouterInput } from './driver.js';

export { makeRouter, router } from './driver.js';
export type { RouteLocation, RouterDriver, RouterInput, RouterOptions } from './driver.js';
export { capturedUrl } from './links.js';
export { routes } from './routes.js';
export type { Matcher, Params, RouteMatch, RouteTable, Routes } from './routes.js';

type Output = RouteLocation | undefined;

const fireAndForget = (input: RouterInput): Command<never> =>
  command<RouterInput, Output, unknown, never>(router, input, { onSuccess: () => undefined });

/** Navigates in-app (pushes a history entry, or replaces the current one). */
export function navigate(
  url: string,
  options: { readonly replace?: boolean } = {},
): Command<never> {
  return fireAndForget({ _tag: 'Navigate', url, replace: options.replace ?? false });
}

/** Moves through history by `delta` entries (`-1` is back). */
export function go(delta: number): Command<never> {
  return fireAndForget({ _tag: 'Traverse', delta });
}

export const back = (): Command<never> => go(-1);
export const forward = (): Command<never> => go(1);

/**
 * Streams the current location, then every URL change, as messages until the component
 * disconnects (a streaming command, ADR 0006/0009). Start it once, usually from `init`:
 *
 *   init: () => [initial, [listen((location) => ({ _tag: 'Routed', location }))]]
 */
export function listen<M>(toMsg: (location: RouteLocation) => M | undefined): Command<M> {
  return command<RouterInput, Output, unknown, M>(
    router,
    { _tag: 'Listen' },
    {
      onSuccess: (location) => (location === undefined ? undefined : toMsg(location)),
      key: 'router:listen',
      concurrency: 'switch',
    },
  );
}

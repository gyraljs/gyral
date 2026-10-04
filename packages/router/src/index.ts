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
 * Delivers the next URL change as a message. Without `after` it delivers the current location
 * at once (use it in `init`). Re-arm it from the reducer with the location you received:
 *
 *   Routed: (s, m) => [{ ...s, route: app.match(m.location.href) }, [listen(toRouted, m.location)]]
 *
 * Changes that happen before re-arming are not lost: `after` carries the last `seq` seen.
 */
export function listen<M>(
  toMsg: (location: RouteLocation) => M | undefined,
  after?: RouteLocation,
): Command<M> {
  return command<RouterInput, Output, unknown, M>(
    router,
    { _tag: 'Listen', since: after?.seq ?? -1 },
    {
      onSuccess: (location) => (location === undefined ? undefined : toMsg(location)),
      key: 'router:listen',
      concurrency: 'switch',
    },
  );
}

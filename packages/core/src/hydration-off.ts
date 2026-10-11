// `#hydration-loader` in client-only builds (`gyralVitePreset({ clientOnly: true })`,
// gyral-c5d.11, view/07-hydration.md "Client-only builds"): the same exports as
// hydration-loader.ts, without the hydration walk or its import(), so the bundle has no
// hydration chunk (and, without other import()s, no preload helper). A server-rendered host
// met anyway renders fresh: its seed is dropped (init runs from its attributes), `hydrationCode`
// is `null` as after a failed load, so element.ts clears the root, and islands start at once.
// Development warns once; production renders fresh silently.
import type * as Loader from './hydration-loader.js';
import { SEED_ATTRIBUTE, type Seed } from './hydration.js';
import { DEV } from './view/index.js';

let warned = false;

/** A seed means server-rendered markup: drop it, so the host renders fresh. */
export const takeSeed = ((host: Element): Seed | undefined => {
  if (!host.hasAttribute(SEED_ATTRIBUTE)) return undefined;
  host.removeAttribute(SEED_ATTRIBUTE);
  if (DEV && !warned) {
    warned = true;
    console.warn(
      `gyral: <${host.localName}> was server-rendered (it has a hydration seed), but this app ` +
        `is built client-only (gyralVitePreset({ clientOnly: true })), which leaves the ` +
        `hydration code out: it renders fresh, replacing the server's markup, and so does every ` +
        `server-rendered host. Drop clientOnly for apps that render on the server ` +
        `(view/07-hydration.md "Client-only builds").`,
    );
  }
  return { props: {} };
}) satisfies typeof Loader.takeSeed;

/** Never loads: server-rendered hosts render fresh, as after a failed load. */
export const hydrationCode: typeof Loader.hydrationCode = null;

/** Not reached (`hydrationCode` is never undefined); runs `next` at once. */
export const whenHydrationLoads = ((next: () => void): void => {
  next();
}) satisfies typeof Loader.whenHydrationLoads;

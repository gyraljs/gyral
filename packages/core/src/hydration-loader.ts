// The client's half of seeds and hydration loading (view/07-hydration.md "Loading"), core's
// `#hydration-loader`: reads a server-rendered host's seed on connect and loads the hydration
// walk (hydration-client.ts) with import() when the first host that needs it connects.
// Client-only builds (`gyralVitePreset({ clientOnly: true })`, gyral-c5d.11) resolve
// `#hydration-loader` to hydration-off.ts instead: no import(), so no hydration chunk.
import { SEED_ATTRIBUTE, type Seed } from './hydration.js';
import { hold } from './scheduler.js';

/** Client side: reads and removes the seed, if this element was server-rendered by Gyral. */
export function takeSeed(host: Element): Seed | undefined {
  const raw = host.getAttribute(SEED_ATTRIBUTE);
  if (raw === null) return undefined;
  host.removeAttribute(SEED_ATTRIBUTE);
  try {
    const parsed = JSON.parse(raw) as Partial<Seed> | null;
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const props = parsed.props ?? {};
    return 'state' in parsed ? { state: parsed.state, props } : { props };
  } catch (error) {
    console.error(`<${host.localName}> has an unreadable ${SEED_ATTRIBUTE}`, error);
    return undefined;
  }
}

/**
 * The walk and islands (hydration-client.ts) once loaded; `null` if loading failed (a stale
 * deployment: server-rendered hosts then render fresh); undefined until then.
 */
export let hydrationCode: typeof import('./hydration-client.js') | null | undefined;
/** Hosts waiting for the code, in connection order; undefined when no load is pending. */
let waiting: (() => void)[] | undefined;

/**
 * Loads the hydration code (once) and runs `next` when it has loaded or failed, in call
 * order. settled() waits meanwhile (view/07-hydration.md "Loading").
 */
export function whenHydrationLoads(next: () => void): void {
  if (waiting !== undefined) {
    waiting.push(next);
    return;
  }
  waiting = [next];
  const done = (code: typeof hydrationCode): void => {
    hydrationCode = code;
    const hosts = waiting ?? [];
    waiting = undefined;
    // Each in its own microtask, in order: one host throwing doesn't stop the others. They all
    // run before `hold` counts the load as done.
    for (const host of hosts) queueMicrotask(host);
  };
  hold(
    import('./hydration-client.js').then(done, (error: unknown) => {
      console.error('gyral: hydration code failed to load; rendering fresh', error);
      done(null);
    }),
  );
}

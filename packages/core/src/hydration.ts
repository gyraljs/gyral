// Server-render seeds (docs/design-docs/0012-ssr.md, view/06-server.md "Components"). The
// server writes each component's state, plus the props an attribute can't carry, into one
// attribute; the client reads it on connect, before its first render, so both sides start from
// the same state. The walk that then hydrates the server's DOM is hydration-client.ts, which
// core loads lazily (view/07-hydration.md "Loading").
import { warnJsonHazard } from './json-safety.js';
import { hold } from './scheduler.js';
import { DEV } from './view/index.js';

/** Host attribute holding the JSON seed. Removed once the client has read it. */
export const SEED_ATTRIBUTE = 'data-gyral-seed';

export interface Seed {
  /**
   * The server's state. Omitted when it equals what `init(props)` returns for the seeded
   * props (gyral-czi 4k7.10): the client recomputes it instead of reading a second copy of
   * data the props already carry.
   */
  readonly state?: unknown;
  readonly props: Readonly<Record<string, unknown>>;
}

/** JSON equality: seeds are JSON, so two values that serialize alike hydrate alike. */
export const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Server side: the seed for a component whose props `carried` travel in no attribute
 * (property holes) and whose state is `state`; `initial` is `init(props)`'s state.
 */
export function makeSeed(
  tag: string,
  state: unknown,
  initial: unknown,
  carried: Readonly<Record<string, unknown>>,
): Seed {
  const seed: Seed = sameJson(state, initial) ? { props: carried } : { state, props: carried };
  if (DEV) warnJsonHazard(`<${tag}>`, seed, 'seed'); // view/06-server.md "Seed": development

  return seed;
}

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
    for (const host of hosts) {
      try {
        host();
      } catch (error) {
        reportError(error);
      }
    }
  };
  hold(
    import('./hydration-client.js').then(done, (error: unknown) => {
      console.error('gyral: the hydration code failed to load; rendering fresh.', error);
      done(null);
    }),
  );
}

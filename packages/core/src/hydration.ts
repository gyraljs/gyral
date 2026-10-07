// Server-render seeds (docs/design-docs/0012-ssr.md, view/06-server.md "Components"). The
// server writes each component's state, plus the props an attribute can't carry, into one
// attribute; the client reads it on connect, before its first render, so both sides start from
// the same state. The client reads seeds in hydration-loader.ts (core's `#hydration-loader`:
// hydration-off.ts in client-only builds); the walk that then hydrates the server's DOM is
// hydration-client.ts, which the loader imports lazily (view/07-hydration.md "Loading").
import { warnJsonHazard } from './json-safety.js';
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

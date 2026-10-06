// Server-render seeds (docs/design-docs/0012-ssr.md, view/06-server.md "Components"). The
// server writes each component's state, plus the props an attribute can't carry, into one
// attribute; the client reads it before its first render so both sides start from the same
// state, then hydrates the server's DOM with that render (view/07-hydration.md).
import { DEVTOOLS_ENABLED, devMismatch } from '#devtools';
import { warnJsonHazard } from './json-safety.js';
import { DEV, hydrate, HydrationMismatch, render, type ChildValue } from './view/index.js';

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
 * Hydrates a server-rendered host's root with its first view (view/07-hydration.md "Steps").
 * A shadow root swaps styles in the same step (08 "Hydration"): the shared sheets are adopted
 * and the server's `<style>` removed. On a mismatch development throws; production recovers
 * this component only: it clears the root, renders fresh and warns.
 */
export function hydrateRoot(
  host: HTMLElement,
  tag: string,
  view: ChildValue,
  root: ShadowRoot | HTMLElement,
  sheets: CSSStyleSheet[] | undefined,
): void {
  if (sheets !== undefined) {
    (root as ShadowRoot).adoptedStyleSheets = sheets;
    const first = root.firstChild;
    if (sheets.length > 0 && first?.nodeName === 'STYLE') first.remove();
  }
  try {
    hydrate(view, root, `<${tag}>`);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
    if (DEVTOOLS_ENABLED) devMismatch(host, tag, error.message);
    if (DEV) throw error;
    console.warn(`${error.message} <${tag}> was rendered fresh.`);
    root.replaceChildren();
    render(view, root);
  }
}

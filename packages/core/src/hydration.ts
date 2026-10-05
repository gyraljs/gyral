// Server-render seeds (docs/design-docs/0012-ssr.md). The server writes each element's
// state, plus the props an attribute can't carry, into one attribute; the client reads it
// before its first (hydrating) render so both sides render the same template.
import type { PropertyDeclaration } from 'lit';
import { warnJsonHazard } from './json-safety.js';

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

type Declarations = Readonly<Record<string, PropertyDeclaration>>;

function attributeName(name: string, decl: PropertyDeclaration): string | undefined {
  if (decl.attribute === false) return undefined;
  return typeof decl.attribute === 'string' ? decl.attribute : name.toLowerCase();
}

/**
 * Server side: records the element's state and its props that are not already present as
 * attributes (property bindings such as `.items=${data}` are not in the HTML otherwise).
 * The SSR renderer escapes attribute values, so the JSON is HTML-safe.
 */
export function writeSeed(
  host: Element,
  state: unknown,
  props: Readonly<Record<string, unknown>>,
  declarations: Declarations,
  initialState?: { readonly value: unknown },
): void {
  const carried: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    const decl = declarations[name] ?? {};
    const attr = attributeName(name, decl);
    if (value !== undefined && (attr === undefined || !host.hasAttribute(attr))) {
      carried[name] = value;
    }
  }
  const derivable = initialState !== undefined && sameJson(state, initialState.value);
  const seed: Seed = derivable ? { props: carried } : { state, props: carried };
  warnJsonHazard(`<${host.localName}>`, seed, 'seed');
  host.setAttribute(SEED_ATTRIBUTE, JSON.stringify(seed));
}

/**
 * Client side, right after hydration (gyral-4k7.12, ADR 0012): Lit SSR writes nothing for
 * an empty primitive (`''`, `null`, `undefined`), so `<!--lit-part--><!--/lit-part-->`
 * has no Text node between the markers. Hydration still records the primitive as the
 * part's committed value, and the next text commit writes `.data` into the
 * `<!--/lit-part-->` comment instead. Restore the empty Text node a client render would
 * have created. Harmless for `nothing` and empty iterables, which clear or insert before
 * the end marker. Shadow roots below `root` are handled by their own hosts.
 */
export function fillEmptyTextParts(root: Node): void {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const empty: Comment[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const next = node.nextSibling;
    if (
      (node as Comment).data === 'lit-part' &&
      next instanceof Comment &&
      next.data === '/lit-part'
    ) {
      empty.push(node as Comment);
    }
  }
  for (const start of empty) start.after(doc.createTextNode(''));
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

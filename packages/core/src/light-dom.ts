// Light-DOM render mode (docs/design-docs/0014-light-dom.md).
import type { CSSResultGroup } from 'lit';
import { toCssResultGroup, type Styles } from './styles.js';

interface SpecLike {
  readonly shadow?: boolean;
  readonly styles?: Styles;
}

export const isLight = (spec: SpecLike): boolean => spec.shadow === false;

/** Shadow components keep their styles; light ones use the document's (and warn if given). */
export function componentStyles(spec: SpecLike, tag: string): CSSResultGroup {
  if (!isLight(spec)) return spec.styles === undefined ? [] : toCssResultGroup(spec.styles);
  if (spec.styles !== undefined) {
    console.warn(`<${tag}> has shadow: false, so its styles are ignored; use document CSS.`);
  }
  return [];
}

/**
 * Is this class a light-DOM Gyral component? Used by @gyral/ssr to render its view as plain
 * children instead of Declarative Shadow DOM.
 */
export function isLightComponent(ctor: unknown): boolean {
  const spec = (ctor as { readonly spec?: SpecLike } | null)?.spec;
  return spec !== undefined && isLight(spec);
}

/**
 * Server-rendered light hosts carry this attribute (ADR 0014 addendum). Hydration uses it to
 * tell a host's own markers from those of light hosts nested inside it.
 */
export const LIGHT_ATTRIBUTE = 'data-gyral-light';

/** Prefix @gyral/ssr puts on Lit's markers inside light views so no hydrate() walk sees them. */
export const HIDDEN_MARKER = 'gyral:';

const LIT_MARKER = /^(?:lit-part|\/lit-part|lit-node)\b/;

/** Server side: marks a light host so the client can scope its markers. */
export function markLightHost(host: Element): void {
  host.setAttribute(LIGHT_ATTRIBUTE, '');
}

/** Is the comment inside `host`'s own light view, not a nested light host's? */
function ownedBy(comment: Comment, host: Element): boolean {
  for (let el = comment.parentElement; el !== null; el = el.parentElement) {
    if (el === host) return true;
    if (el.hasAttribute(LIGHT_ATTRIBUTE)) return false;
  }
  return false;
}

/**
 * Client side, on a server-rendered light host's first update: turns the host's own hidden
 * markers back into Lit's, leaving nested light hosts' markers hidden until they hydrate.
 * Returns whether the host's root part marker was found (so Lit can hydrate in place).
 */
export function revealLightMarkers(host: Element): boolean {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_COMMENT);
  const own: Comment[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const comment = node as Comment;
    const data = comment.data.slice(HIDDEN_MARKER.length);
    if (comment.data.startsWith(HIDDEN_MARKER) && LIT_MARKER.test(data) && ownedBy(comment, host)) {
      own.push(comment);
    }
  }
  for (const comment of own) comment.data = comment.data.slice(HIDDEN_MARKER.length);
  return own[0]?.data.startsWith('lit-part') === true;
}

/** Is `@lit-labs/ssr-client/lit-element-hydrate-support.js` loaded (it patches LitElement)? */
export const hydrateSupportLoaded = (): boolean =>
  typeof (globalThis as { litElementHydrateSupport?: unknown }).litElementHydrateSupport ===
  'function';

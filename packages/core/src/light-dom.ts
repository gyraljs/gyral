// Light-DOM render mode (docs/design-docs/0014-light-dom.md).
import { adoptStyles, type CSSResultGroup, type CSSResultOrNative } from 'lit';
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

/** Lit's public `hydrate()` from `@lit-labs/ssr-client`. */
export type Hydrate = (
  value: unknown,
  container: HTMLElement | DocumentFragment,
  options?: object,
) => void;

/**
 * Where `@gyral/ssr/hydrate` registers Lit's public `hydrate()` (gyral-czi.38). A global
 * symbol, not an import, so core doesn't depend on `@lit-labs/ssr-client` and apps without
 * SSR don't ship it.
 */
export const HYDRATE_KEY: unique symbol = Symbol.for('gyral.hydrate') as never;

/**
 * Lit's `hydrate()`, if a server-rendered app loaded `@gyral/ssr/hydrate`. Used for light hosts
 * and, since gyral-czi.41, for server-rendered shadow roots too: Gyral hydrates both itself, so
 * it never depends on Lit's hydrate support having patched LitElement before Lit evaluated.
 */
export const hydrator = (): Hydrate | undefined => {
  const fn = (globalThis as { [HYDRATE_KEY]?: unknown })[HYDRATE_KEY];
  return typeof fn === 'function' ? (fn as Hydrate) : undefined;
};

/**
 * First update of a server-rendered (declarative) shadow root: hydrate the server's view in
 * place with Lit's public hydrate(), which leaves the root part on the shadow root so the
 * render() inside LitElement's update() updates it instead of appending a second copy
 * (gyral-czi.41). Without `@gyral/ssr/hydrate` loaded, clear the server's view and let Lit
 * render fresh, adopting the styles Lit's own createRenderRoot would have.
 */
export function hydrateShadow(
  root: ShadowRoot,
  view: unknown,
  options: object,
  styles: CSSResultOrNative[],
): void {
  const hydrate = hydrator();
  if (hydrate !== undefined) {
    hydrate(view, root, options);
    return;
  }
  root.replaceChildren();
  adoptStyles(root, styles);
}

/**
 * First update of a server-rendered light host: reveal this host's own hidden markers now (not
 * on connect: a deferred child connects mid-way through its parent's hydrate walk), then call
 * Lit's public hydrate(). It leaves the root part on the host, so the render() inside
 * LitElement's update() updates it in place instead of appending a second copy. No Lit private
 * fields: their names are mangled in Lit's production build (ADR 0014, gyral-czi.38). Without
 * `@gyral/ssr/hydrate` loaded, clear the server's view and let Lit render fresh.
 */
export function hydrateLight(host: HTMLElement, view: unknown, options: object): void {
  const hydrate = hydrator();
  if (hydrate !== undefined && revealLightMarkers(host)) hydrate(view, host, options);
  else host.replaceChildren();
}

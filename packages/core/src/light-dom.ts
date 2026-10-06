// Light-DOM render mode (docs/design-docs/0014-light-dom.md): `shadow: false` renders the view
// as the host's own children, styled by document CSS.

interface SpecLike {
  readonly shadow?: boolean;
}

export const isLight = (spec: SpecLike): boolean => spec.shadow === false;

/** Is this class a light-DOM Gyral component (`shadow: false`)? */
export function isLightComponent(ctor: unknown): boolean {
  const spec = (ctor as { readonly spec?: SpecLike } | null)?.spec;
  return spec !== undefined && isLight(spec);
}

/**
 * Server-rendered light hosts carry this attribute (ADR 0014 addendum, view/06-server.md
 * "Components"), so hydration (Phase 5) can tell a light host's own content from a nested one's.
 */
export const LIGHT_ATTRIBUTE = 'data-gyral-light';

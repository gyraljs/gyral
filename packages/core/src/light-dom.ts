// Light-DOM render mode (docs/design-docs/0014-light-dom.md).
import type { CSSResultGroup } from 'lit';

interface SpecLike {
  readonly shadow?: boolean;
  readonly styles?: CSSResultGroup;
}

export const isLight = (spec: SpecLike): boolean => spec.shadow === false;

/** Shadow components keep their styles; light ones use the document's (and warn if given). */
export function componentStyles(spec: SpecLike, tag: string): CSSResultGroup {
  if (!isLight(spec)) return spec.styles ?? [];
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

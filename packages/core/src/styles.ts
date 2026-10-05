// Component styles (gyral-czi.24): `css` templates, plain strings or constructed sheets.
import { unsafeCSS, type CSSResultGroup, type CSSResultOrNative } from 'lit';

/**
 * What `spec.styles` accepts:
 * - `css` tagged templates (Lit's `CSSResult`);
 * - plain strings, e.g. a stylesheet module shared with the document (`import base from
 *   './base.css?raw'`). Strings are trusted CSS from your own code, never user input;
 * - `CSSStyleSheet` instances (constructable stylesheets, shared across components);
 * - arrays of any of these, nested freely.
 */
export type Styles = CSSResultOrNative | string | readonly Styles[];

/** Normalizes `Styles` into what Lit's `static styles` expects. */
export function toCssResultGroup(styles: Styles): CSSResultGroup {
  if (typeof styles === 'string') return unsafeCSS(styles);
  if (Array.isArray(styles)) return (styles as readonly Styles[]).map(toCssResultGroup);
  return styles as CSSResultOrNative;
}

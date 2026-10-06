// Gyral's `html` and `svg` template tags: Lit's, with template whitespace minified once per call
// site (template-whitespace.ts, gyral-9rf). Server and browser run the same code, so the
// templates (and their hydration digests) are identical in every toolchain. For exact
// whitespace outside <pre>/<textarea>, import `html` from 'lit' instead.
import { html as litHtml, svg as litSvg, type TemplateResult } from 'lit';
import { minifyTemplate } from './template-whitespace.js';

/** Lit's `html`, with indentation whitespace between tags removed. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult<1> {
  return litHtml(minifyTemplate(strings), ...values);
}

/** Lit's `svg`, with indentation whitespace between elements removed. */
export function svg(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult<2> {
  return litSvg(minifyTemplate(strings), ...values);
}

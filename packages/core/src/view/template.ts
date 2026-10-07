// Template results and the `html` and `svg` tags (view/01-templates.md "Authoring", "Template
// results", "svg templates"). A result is a template source (the call site's strings, or a
// template object) plus this call's values, recognised by a module-private symbol so data from
// JSON can never pass for one. `templateOf` turns the source into the template object: compiled
// and svg results carry it, html results are normalized once per strings array through
// `#prepare` (prepare.ts).
import { prepare } from '#prepare';
import type { TemplateObject } from './normalize/types.js';
import { svgTemplate } from './template-element.js';

const SOURCE: unique symbol = Symbol('gyral.template');

/** What `html` returns: a template plus this render's values. */
export interface TemplateResult {
  readonly [SOURCE]: readonly string[] | TemplateObject;
  readonly values: readonly unknown[];
}

/** The template tag: `` html`<p>${s.text}</p>` ``. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult {
  return { [SOURCE]: strings, values };
}

/**
 * The SVG fragment tag: `` svg`<path d=${s.d} />` ``. Its top level is SVG content, so it
 * renders only inside an `<svg>` (or another SVG element) of an html template
 * (view/01-templates.md "svg templates"). A whole `<svg>` graphic is written with html.
 */
export function svg(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult {
  return compiledSvg(prepare(strings, true), values);
}

/** Internal: what the template compiler (`@gyral/core/vite`) rewrites `html` calls into. */
export function compiled(template: TemplateObject, values: readonly unknown[]): TemplateResult {
  return { [SOURCE]: template, values };
}

/** Internal: what the template compiler rewrites `svg` calls into. */
export function compiledSvg(template: TemplateObject, values: readonly unknown[]): TemplateResult {
  svgTemplate(template);
  return { [SOURCE]: template, values };
}

export function isTemplateResult(value: unknown): value is TemplateResult {
  return typeof value === 'object' && value !== null && SOURCE in value;
}

/** Internal: a result's source, compared by identity to skip `templateOf` on updates. */
export const sourceOf = (result: TemplateResult): readonly string[] | TemplateObject =>
  result[SOURCE];

/**
 * The template object of a result: compiled results carry it; a runtime result's call site is
 * normalized once by `#prepare` (cached there, so compiled builds carry neither the preparer
 * nor its cache).
 */
export function templateOf(result: TemplateResult): TemplateObject {
  const source = result[SOURCE];
  return Array.isArray(source) ? prepare(source) : (source as TemplateObject);
}

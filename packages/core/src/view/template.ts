// Template results and the `html` tag (view/01-templates.md "Authoring", "Template results").
// A result is a template source (the call site's strings, or a compiled template object) plus
// this call's values, recognised by a module-private symbol so data from JSON can never pass
// for one. `templateOf` turns the source into the template object: compiled results carry it,
// runtime results are normalized once per strings array through `#prepare` (prepare.ts).
import { prepare } from '#prepare';
import type { TemplateObject } from './normalize/types.js';

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

/** Internal: what the template compiler (Phase 6) rewrites `html` calls into. */
export function compiled(template: TemplateObject, values: readonly unknown[]): TemplateResult {
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

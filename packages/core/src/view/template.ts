// Template results and the `html` tag (view/01-templates.md "Authoring", "Template results").
// A result is a template source (the call site's strings, or a compiled template object) plus
// this call's values, recognised by a module-private symbol so data from JSON can never pass
// for one. `templateOf` turns the source into the template object: compiled results carry it,
// runtime results are normalized once per strings array through `#prepare`.
import { prepare } from '#prepare';
import type { TemplateObject } from './normalize/types.js';

const SOURCE: unique symbol = Symbol('gyral.template');

/** What `html` returns: a template plus this render's values. */
export interface TemplateResult {
  readonly [SOURCE]: readonly string[] | TemplateObject;
  readonly values: readonly unknown[];
}

/** The template tag: `html\`<p>${s.text}</p>\``. */
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

const prepared = new WeakMap<readonly string[], TemplateObject>();

/** The template object of a result (normalized on the first render of its call site). */
export function templateOf(result: TemplateResult): TemplateObject {
  const source = result[SOURCE];
  if (!Array.isArray(source)) return source as TemplateObject;
  let template = prepared.get(source);
  if (template === undefined) {
    template = prepare(source);
    prepared.set(source, template);
  }
  return template;
}

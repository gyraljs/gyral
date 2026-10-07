// Template results and the `html` and `svg` tags (view/01-templates.md "Authoring", "Template
// results", "svg templates"). A result is a template source (the call site's strings, or a
// template object) plus this call's values, recognised by a module-private symbol so data from
// JSON can never pass for one. `templateOf` turns the source into the template object: compiled
// and svg results carry it, html results are normalized once per strings array through
// `#prepare` (prepare.ts). Development records each call site's source location (loc.ts) for
// error messages.
import { prepare } from '#prepare';
import { DEV } from '#view-dev';
import { callSite, locOf, setLoc } from './loc.js';
import type { TemplateObject } from './normalize/types.js';
import { svgTemplate } from './template-element.js';

const SOURCE: unique symbol = Symbol('gyral.template');

/** What `html` returns: a template plus this render's values. */
export interface TemplateResult {
  readonly [SOURCE]: readonly string[] | TemplateObject;
  readonly values: readonly unknown[];
}

/** The template tag, as `html` is in production. */
function tag(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult {
  // Development: the call site, from the stack, the first time (unless `html.at` gave it).
  if (DEV && locOf(strings) === undefined) setLoc(strings, callSite(new Error().stack));
  return { [SOURCE]: strings, values };
}

/** The svg tag, as `svg` is in production: svg results carry their (prepared) template. */
function svgTag(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult {
  // Development: the call site, from the stack, the first time (unless `svg.at` gave it), so
  // the normalizer's rule errors name it.
  if (DEV && locOf(strings) === undefined) setLoc(strings, callSite(new Error().stack));
  return compiledSvg(prepare(strings, true), values);
}

type Tag = typeof tag;

/**
 * Development: `html.at(loc)` (and `svg.at(loc)`) is the tag with a known call site. The Vite
 * preset's dev transform (compiler/locate.ts) writes it at every call site, since stack
 * positions in transformed modules aren't the author's lines. Attached here, not by a statement
 * that mentions the tag, so production builds don't keep it alive (the compiler checks that).
 */
function withAt(html: Tag): Tag {
  const tags = new Map<string, Tag>();
  const at = (loc: string): Tag => {
    let located = tags.get(loc);
    if (located === undefined) {
      located = (strings, ...values) => {
        setLoc(strings, loc);
        return html(strings, ...values);
      };
      tags.set(loc, located);
    }
    return located;
  };
  return Object.assign(html, { at });
}

/** The template tag: `` html`<p>${s.text}</p>` ``. */
export const html: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult = DEV
  ? withAt(tag)
  : tag;

/**
 * The SVG fragment tag: `` svg`<path d=${s.d} />` ``. Its top level is SVG content, so it
 * renders only inside an `<svg>` (or another SVG element) of an html template
 * (view/01-templates.md "svg templates"). A whole `<svg>` graphic is written with html.
 */
export const svg: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult = DEV
  ? withAt(svgTag)
  : svgTag;

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

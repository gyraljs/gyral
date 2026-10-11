// One <template> element per template object, created on first use (view/01-templates.md
// "Instantiation"). The browser's own parser builds it from the template HTML; the runtime
// preparer then checks the parse (rule 7). Server templates never get one (rule 11). An svg
// template's is prepared by `svgTemplate` when its first result is made (template.ts `svg`), so
// apps without svg templates don't carry that code. Both parse through the `gyral` Trusted Types
// policy (trusted-html.ts).
import { verify } from '#prepare';
import { DEV } from '#view-dev';
import { message } from './message.js';
import { SERVER_ONLY, TemplateError } from './normalize/errors.js';
import type { TemplateObject } from './normalize/types.js';
import { trustedHTML } from './trusted-html.js';

const elements = new WeakMap<TemplateObject, HTMLTemplateElement>();

/** The cached <template> element for `template`, parsed (and checked) on first use. */
export function templateElement(template: TemplateObject): HTMLTemplateElement {
  const cached = elements.get(template);
  if (cached !== undefined) return cached;
  if (template.server) {
    // Production keeps a short message: the class and its explanation stay out of the bundle.
    throw DEV ? new TemplateError(11, SERVER_ONLY, template.loc) : new Error(message(71));
  }
  const el = document.createElement('template');
  el.innerHTML = trustedHTML(template.html);
  verify(template, el);
  elements.set(template, el);
  return el;
}

/**
 * Prepares an svg template's <template> element (01 "svg templates"): its HTML is parsed inside
 * an <svg>, so the parser creates SVG elements (camelCase names and attributes, namespaced
 * static attributes), and that <svg>'s children become the content. Called with every svg
 * result, before anything renders it; outside a document (the server) there is nothing to do.
 */
export function svgTemplate(template: TemplateObject): void {
  if (elements.has(template) || typeof document === 'undefined') return;
  const el = document.createElement('template');
  el.innerHTML = trustedHTML(`<svg>${template.html}</svg>`);
  const content = el.content;
  // Anything the parser moved out of the <svg> is dropped here, and the check reports it.
  content.replaceChildren(...(content.firstChild as Element).childNodes);
  verify(template, el);
  elements.set(template, el);
}

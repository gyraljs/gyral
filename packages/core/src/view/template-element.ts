// One <template> element per template object, created on first use (view/01-templates.md
// "Instantiation"). The browser's own parser builds it from the template HTML; the runtime
// preparer then checks the parse (rule 7). Server templates never get one (rule 11).
import { verify } from '#prepare';
import { SERVER_ONLY, TemplateError } from './normalize/errors.js';
import type { TemplateObject } from './normalize/types.js';

const elements = new WeakMap<TemplateObject, HTMLTemplateElement>();

/** The cached <template> element for `template`, parsed (and checked) on first use. */
export function templateElement(template: TemplateObject): HTMLTemplateElement {
  const cached = elements.get(template);
  if (cached !== undefined) return cached;
  if (template.server) throw new TemplateError(11, SERVER_ONLY, template.loc);
  const el = document.createElement('template');
  el.innerHTML = template.html;
  verify(template, el);
  elements.set(template, el);
  return el;
}

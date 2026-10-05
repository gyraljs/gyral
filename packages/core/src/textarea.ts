// <textarea> support (gyral-czi.34). Lit can't bind inside <textarea>: its content is raw
// text, so `html\`<textarea>${v}</textarea>\`` throws during SSR ("Unexpected final
// partIndex") and never updates in the browser. `textarea()` renders the element as a static,
// escaped template (correct no-JS markup and a hydration match), then keeps it in sync by
// setting properties and attributes on the same element.
import { noChange } from 'lit';
import { Directive, directive, PartType, type ChildPart, type PartInfo } from 'lit/directive.js';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';

export type TextareaAttribute = string | number | boolean | null | undefined;

export interface TextareaOptions {
  /** The model's value. Applied to the live element only when the model changes. */
  readonly value: string;
  /** Attributes such as name, id, rows, required, maxlength, data-intent, aria-invalid. */
  readonly attrs?: Readonly<Record<string, TextareaAttribute>>;
}

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');
const ATTR_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

function attrMarkup(attrs: TextareaOptions['attrs']): string {
  return Object.entries(attrs ?? {})
    .map(([name, value]) => {
      if (!ATTR_NAME.test(name)) throw new Error(`textarea(): invalid attribute name "${name}"`);
      if (value === false || value === null || value === undefined) return '';
      return value === true ? ` ${name}` : ` ${name}="${escapeAttr(String(value))}"`;
    })
    .join('');
}

/** The markup the server writes, and the client's first render: escaped, no bindings inside. */
export function textareaMarkup({ value, attrs }: TextareaOptions): string {
  return `<textarea${attrMarkup(attrs)}>${escapeText(value)}</textarea>`;
}

function findTextarea(part: ChildPart): HTMLTextAreaElement | undefined {
  for (
    let node = part.startNode?.nextSibling;
    node && node !== part.endNode;
    node = node.nextSibling
  ) {
    if (node instanceof HTMLTextAreaElement) return node;
  }
  return undefined;
}

function syncAttributes(el: HTMLTextAreaElement, attrs: TextareaOptions['attrs']): void {
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
}

class TextareaDirective extends Directive {
  /** The model value last applied, so typing isn't overwritten by an unchanged model. */
  #applied: string | undefined;

  constructor(info: PartInfo) {
    super(info);
    if (info.type !== PartType.CHILD) {
      throw new Error('textarea() must be used in a child position: html`${textarea({…})}`');
    }
  }

  override render(options: TextareaOptions): unknown {
    return staticHtml`${unsafeStatic(textareaMarkup(options))}`;
  }

  override update(part: ChildPart, [options]: [TextareaOptions]): unknown {
    const el = findTextarea(part);
    if (el === undefined) {
      // First render (client) or hydration (server markup already in place): same template.
      this.#applied = options.value;
      return this.render(options);
    }
    syncAttributes(el, options.attrs);
    if (this.#applied === undefined) {
      // Hydration: the server's element is already here. Keep whatever the user typed before
      // the script loaded; only later model changes write the value.
      this.#applied = options.value;
      return noChange;
    }
    if (options.value !== this.#applied) {
      this.#applied = options.value;
      if (el.value !== options.value) el.value = options.value;
    }
    return noChange;
  }
}

/**
 * A `<textarea>` whose content comes from the model, safe for SSR and hydration:
 *
 *   ${textarea({ value: s.message, attrs: { name: 'message', rows: 5, required: true,
 *                                            'data-intent': i.Message } })}
 *
 * Text typed before or after hydration is kept until the model's value changes.
 */
export const textarea = directive(TextareaDirective);

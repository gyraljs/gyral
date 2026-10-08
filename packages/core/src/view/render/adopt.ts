// The parallel walk (view/07-hydration.md "The parallel walk"): visits a template's static
// structure (its parsed content) and the server DOM together, and builds the same parts the
// client renderer would, with this render's values as committed values. It writes nothing,
// except splitting merged text at known lengths (`splitText`), creating the empty Text node of
// an `''` value, joining text the parser split, removing development markers, and writing a
// `style` attribute a strict CSP blocked through the CSSOM. Nested templates, lists (rows one
// after another, no markers), arrays and `raw()` are walked in turn. Nested Gyral hosts: a
// shadow host's light children are the parent's content (slotted) and are walked; its shadow
// root never is; a light host (`data-gyral-light`) is opaque.
// Development checks every node, text and bound attribute, and the `<!--gyral:ID-->` markers
// when present; production checks node types, local names and text lengths.
import { DEV } from '#view-dev';
import { LIGHT_ATTRIBUTE } from '../attributes.js';
import { CHILD_BEFORE, type PartSpec, type TemplateObject } from '../normalize/types.js';
import { isTemplateResult, sourceOf, templateOf, type TemplateResult } from '../template.js';
import { adoptionOf, type Adoption } from './adopt-plan.js';
import { adoptAttr, checkAttr } from './adopt-attr.js';
import { attrPart, TEXTAREA, TITLE } from './attr-parts.js';
import { ChildPart, INSTANCE, ITEMS, LIST, RAW, TEXT } from './child-part.js';
import { checkKeys } from './dev-check.js';
import { Instance } from './instance.js';
import { mismatch } from './mismatch.js';
import { ROOT, SOLE } from './plan.js';
import { parse, RawRange } from './raw.js';
import { report } from './seen.js';
import { List } from './rows.js';
import { isList, rawHtml, type ListResult } from './values.js';

/** The walk's position: the next DOM node; null at the end of `parent`'s children. */
let cur: Node | null = null;
let parent: Node;
/** For mismatch messages: the host's root, the component, the template being walked. */
let top: Node;
let host = '';
let current: TemplateObject | undefined;

const fail = (expected: string, found: Node | string | null = cur, at: Node = parent): never =>
  mismatch(expected, found, at, top, host, current?.loc);

/** Adopts the server DOM in `root` (a host's root) as `part`'s content for `value`. */
export function adopt(part: ChildPart, value: unknown, root: Node, label: string): void {
  top = parent = root;
  cur = root.firstChild;
  host = label;
  current = undefined;
  content(part, value);
  if (cur !== null) fail('the end of the view');
}

/** A child value at the walk's position (view/02-bindings.md "Child values"). */
function content(part: ChildPart, v: unknown): void {
  switch (typeof v) {
    case 'string':
    case 'number': {
      const data = typeof v === 'string' ? v : String(v);
      part.kind = TEXT;
      part.value = v;
      if (data !== '') part.content = text(data);
      else parent.insertBefore((part.content = document.createTextNode('')), cur);
      return;
    }
    case 'object':
      if (v === null) return;
      if (isTemplateResult(v)) {
        part.kind = INSTANCE;
        part.content = instance(v, part);
      } else if (isList(v)) rows(part, v.items, v);
      else if (Array.isArray(v)) rows(part, v, undefined);
      else {
        const markup = rawHtml(v);
        if (markup !== undefined) raw(part, markup);
        else if (DEV) part.commit(v);
      }
      return;
    default:
      // Development: a value no hole renders throws (or warns, for `true`) as on the client.
      // Called through the part, so this chunk imports no development-only function.
      if (DEV) part.commit(v);
  }
}

/** Static text or a text value: exactly `want`'s length, split off a longer Text node. */
function text(want: string): Text {
  // The parser turns CR and CRLF into LF.
  const data = want.includes('\r') ? want.replace(/\r\n?/g, '\n') : want;
  const t = cur as Text | null;
  if (t !== null && t.nodeType === 3) {
    // Join text the parser split (very long runs).
    for (let n = t.nextSibling; t.length < data.length && n !== null && n.nodeType === 3;) {
      t.appendData((n as Text).data);
      (n as Text).remove();
      n = t.nextSibling;
    }
    if (t.length >= data.length && (!DEV || t.data.startsWith(data))) {
      if (t.length > data.length) t.splitText(data.length);
      cur = t.nextSibling;
      return t;
    }
  }
  return fail(`text ${JSON.stringify(data.slice(0, 40))}`);
}

function instance(result: TemplateResult, holder: ChildPart): Instance {
  const template = templateOf(result);
  if (DEV && template.svg && !svgContent(parent)) {
    fail(`an svg template inside SVG content (view/01-templates.md "svg templates")`, parent);
  }
  const a = adoptionOf(template);
  // A development server's marker: checked when present (a production server writes none),
  // against the id when the template has one (production client objects don't, 01).
  const marker = cur as Comment | null;
  if (marker !== null && marker.nodeType === 8 && marker.data.startsWith('gyral:')) {
    const id = template.id;
    if (DEV && id !== undefined && marker.data !== `gyral:${id}`) fail(`<!--gyral:${id}-->`);
    cur = marker.nextSibling;
    marker.remove();
  }
  const outer = current;
  current = template;
  const inst = new Instance(template, sourceOf(result), holder, true);
  children(a.plan.content, a, inst, result.values);
  current = outer;
  return inst;
}

/** The children of template node `t`, with the child holes between them. */
function children(t: Node, a: Adoption, inst: Instance, values: readonly unknown[]): void {
  const holes = a.holes.get(t);
  const root = t === a.plan.content;
  let h = 0;
  for (let n = t.firstChild, j = 0; ; n = n.nextSibling, j++) {
    if (holes !== undefined && h < holes.length) {
      const i = holes[h] as number;
      const spec = a.specs[i] as PartSpec;
      const ref = spec[0] === CHILD_BEFORE ? spec[2] : null;
      if (n === null ? ref === null : ref === j) {
        hole(i, ref, a, inst, values);
        h++;
      }
    }
    if (n === null) return;
    const dom = node(n, a, inst, values);
    if (root) {
      if (j === 0) inst.start = dom;
      inst.end = dom;
    }
  }
}

/** A child hole: its content, then its reference node (the DOM node the walk reached). */
function hole(
  i: number,
  ref: number | null,
  a: Adoption,
  inst: Instance,
  values: readonly unknown[],
): void {
  const kind = a.plan.kinds[i] as number;
  const at = a.plan.at[i] as number;
  const part =
    kind === ROOT
      ? new ChildPart(null, null, null, 0, false, at)
      : new ChildPart(parent, null, null, 0, kind === SOLE, at);
  inst.parts[i] = part;
  content(part, values[at]);
  if (ref !== null) {
    part.ref = cur;
    if (kind === ROOT && ref === 0) inst.head = part;
  } else if (kind === ROOT) {
    part.owner = inst;
    inst.tail = part;
  }
}

function node(t: Node, a: Adoption, inst: Instance, values: readonly unknown[]): Node {
  if (t.nodeType === 3) return text((t as Text).data);
  if (t.nodeType !== 8) return element(t as Element, a, inst, values);
  const c = cur as Comment | null;
  if (c === null || c.nodeType !== 8 || (DEV && c.data !== (t as Comment).data)) {
    return fail(`<!--${(t as Comment).data}-->`);
  }
  cur = c.nextSibling;
  return c;
}

const WHITESPACE_ONLY = /^[\t\n\f\r ]*$/;

/**
 * Development: where an svg template may be (warn.ts `checkSvgParent`, checked here so the lazy
 * chunk imports no development-only function: production bundles drop this).
 */
const svgContent = (el: Node): boolean =>
  (el as Element).namespaceURI === 'http://www.w3.org/2000/svg' &&
  !/^(foreignObject|desc|title)$/.test((el as Element).localName);

function element(t: Element, a: Adoption, inst: Instance, values: readonly unknown[]): Element {
  const el = cur as Element | null;
  if (el === null || el.localName !== t.localName) return fail(`<${t.localName}>`);
  cur = el.nextSibling;
  let whole = false;
  for (const i of a.attrs.get(t) ?? []) {
    const kind = a.plan.kinds[i] as number;
    const part = attrPart(el, kind, a.specs[i] as PartSpec, a.plan.at[i] as number);
    inst.parts[i] = part;
    adoptAttr(part, values);
    if (DEV) checkAttr(part, fail);
    // A server-written style a strict CSP blocked has no declarations: write the adopted value
    // through the CSSOM, which the CSP allows (08 "Style attributes under a strict CSP").
    // After the development check, which compares the attribute as the server wrote it.
    const v = part.value;
    if (part.name === 'style' && typeof v === 'string' && !(el as HTMLElement).style.length) {
      part.write(v);
    }
    if (kind === TEXTAREA || kind === TITLE) whole = true; // the part owns the content
  }
  let holes = a.holes.has(t);
  if (whole) return el;
  if (el.hasAttribute(LIGHT_ATTRIBUTE)) {
    // A light host owns its children (ADR 0014): its parent writes none (06 "Components").
    for (let c = t.firstChild; c !== null; c = c.nextSibling) {
      if (c.nodeType !== 3 || !WHITESPACE_ONLY.test((c as Text).data)) holes = true;
    }
    if (holes) fail(`no children from the parent in light host <${t.localName}>`, el, el);
    return el;
  }
  // A custom element without children in the template: what it holds is its own.
  if (!holes && t.firstChild === null && t.localName.includes('-')) return el;
  const outer = cur;
  const outerParent = parent;
  parent = el;
  cur = el.firstChild;
  children(t, a, inst, values);
  if (cur !== null) fail(`the end of <${t.localName}>`);
  cur = outer;
  parent = outerParent;
  return el;
}

/** Rows of `each` (keyed) or items of an array (`l` undefined), one after another. */
function rows(part: ChildPart, values: readonly unknown[], l: ListResult | undefined): void {
  const list = new List(part);
  part.kind = l === undefined ? ITEMS : LIST;
  part.content = list;
  if (DEV && l !== undefined) checkKeys(values, l.key);
  for (let i = 0; i < values.length; i++) {
    const row = new ChildPart(null, null, list, i, false, -1);
    list.rows.push(row);
    if (l === undefined) {
      content(row, values[i]);
      continue;
    }
    const item = values[i];
    row.key = l.key(item);
    row.item = item;
    row.picked = l.pick === undefined ? undefined : l.pick(item);
    content(row, l.row(item, row.picked));
  }
}

/** `raw()`: its start anchor, then the nodes its markup parses to (texts by length). */
function raw(part: ChildPart, markup: string): void {
  report({ html: markup });
  const start = cur as Comment | null;
  if (start === null || start.nodeType !== 8) return fail('the raw() start anchor <!---->');
  cur = start.nextSibling;
  let end: Node = start;
  for (let n = parse(markup).firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === 3) end = text((n as Text).data);
    else {
      const dom = cur;
      if (dom === null || dom.nodeName !== n.nodeName) return fail(`raw() markup's ${n.nodeName}`);
      end = dom;
      cur = dom.nextSibling;
    }
  }
  part.kind = RAW;
  part.content = new RawRange(start, end, markup);
}

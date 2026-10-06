// Rule 7 by structure (view/09-template-rules.md "How rule 7 is checked"): start tags and text
// that the WHATWG HTML tree builder would move, drop or implicitly close something for, checked
// against the open-element stack. Only real repairs are flagged; the browser's own parse
// (prepare.ts) and the compiler's parse5 check catch anything this misses.
import { msg } from './rules.js';

export type Ns = 'html' | 'svg' | 'math';

export interface OpenElement {
  readonly name: string;
  readonly ns: Ns;
}

/** How the tree builder treats content of a container (its insertion mode, roughly). */
export type Context = 'body' | 'table' | 'tbody' | 'tr' | 'colgroup';

const set = (names: string): ReadonlySet<string> => new Set(names.split(' '));

const TABLE_PARTS = set('caption col colgroup tbody td tfoot th thead tr');
const ALLOWED: Record<Exclude<Context, 'body'>, ReadonlySet<string>> = {
  table: set('caption colgroup thead tbody tfoot script style template'),
  tbody: set('tr script style template'),
  tr: set('td th script style template'),
  colgroup: set('col template'),
};
const CLOSES_P = set(
  'address article aside blockquote center details dialog dir div dl fieldset figcaption ' +
    'figure footer header hgroup main menu nav ol p search section summary ul h1 h2 h3 h4 h5 h6 ' +
    'pre listing form plaintext table hr xmp li dd dt',
);
const HEADINGS = set('h1 h2 h3 h4 h5 h6');
const SCOPE: Record<Ns, ReadonlySet<string>> = {
  html: set('applet caption html table td th marquee object template'),
  math: set('mi mo mn ms mtext annotation-xml'),
  svg: set('foreignobject desc title'),
};
const SPECIAL = set(
  'address applet area article aside base basefont bgsound blockquote body br button caption ' +
    'center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form ' +
    'frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link ' +
    'listing main marquee menu meta nav noembed noframes noscript object ol p param plaintext ' +
    'pre script search section select source style summary table tbody td template textarea ' +
    'tfoot th thead title tr track ul wbr xmp',
);
const LI = set('li');
const DD_DT = set('dd dt');
const FORM = set('form');
const TEMPLATE = set('template');
const OPTION = set('option');
const FORMATTING_MARKERS = set('applet marquee object template td th caption');
const BREAKOUT = set(
  'b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img ' +
    'li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var',
);

/** The context an element's children are parsed in. */
export function contextOf(name: string): Context {
  if (name === 'table') return 'table';
  if (name === 'tbody' || name === 'thead' || name === 'tfoot') return 'tbody';
  if (name === 'tr' || name === 'colgroup') return name;
  return 'body';
}

/**
 * The context of a template root or <template> content: decided by its first start tag
 * (the "in template" insertion mode).
 */
export function rootContext(firstTag: string): Context {
  if (firstTag === 'tr') return 'tbody';
  if (firstTag === 'td' || firstTag === 'th') return 'tr';
  if (firstTag === 'col') return 'colgroup';
  return TABLE_PARTS.has(firstTag) ? 'table' : 'body';
}

const isHtml = (el: OpenElement | undefined, names: ReadonlySet<string>): boolean =>
  el !== undefined && el.ns === 'html' && names.has(el.name);

function inScope(stack: readonly OpenElement[], name: string, extra?: string): boolean {
  for (let k = stack.length - 1; k >= 0; k--) {
    const el = stack[k];
    if (el === undefined) break;
    if (el.ns === 'html' && el.name === name) return true;
    if (SCOPE[el.ns].has(el.name) || (el.ns === 'html' && el.name === extra)) return false;
  }
  return false;
}

/** An open <li> (or <dd>/<dt>) that a new one would close: the "in body" list-item walk. */
function listItemOpen(stack: readonly OpenElement[], names: ReadonlySet<string>): boolean {
  for (let k = stack.length - 1; k >= 0; k--) {
    const el = stack[k];
    if (el === undefined) break;
    if (isHtml(el, names)) return true;
    const special = el.ns === 'html' ? SPECIAL.has(el.name) : SCOPE[el.ns].has(el.name);
    if (special && !(el.ns === 'html' && /^(address|div|p)$/.test(el.name))) return false;
  }
  return false;
}

function formattingOpen(stack: readonly OpenElement[], name: string): boolean {
  for (let k = stack.length - 1; k >= 0; k--) {
    const el = stack[k];
    if (el === undefined || isHtml(el, FORMATTING_MARKERS)) return false;
    if (el.ns === 'html' && el.name === name) return true;
  }
  return false;
}

function inTableMessage(name: string, ctx: Exclude<Context, 'body'>): string {
  const where = ctx === 'tbody' ? '<tbody>' : `<${ctx}>`;
  if (name === 'tr' || ((name === 'td' || name === 'th') && ctx === 'table')) {
    return msg.repaired(
      `<${name}> directly inside ${where}`,
      'Wrap rows in <tbody>: <table><tbody><tr><td>…</td></tr></tbody></table>.',
    );
  }
  if (name === 'td' || name === 'th') {
    return msg.repaired(`<${name}> directly inside ${where}`, 'Wrap cells in <tr>.');
  }
  if (name === 'col')
    return msg.repaired(`<col> directly inside ${where}`, 'Wrap it in <colgroup>.');
  if (ctx === 'colgroup')
    return msg.repaired(`<${name}> inside <colgroup>`, 'Only <col> goes there.');
  return msg.repaired(
    `<${name}> directly inside ${where}`,
    'The parser moves it out of the table. Put it inside a <td>, <th> or <caption>.',
  );
}

/**
 * Rule 7 for a start tag in the HTML namespace. `atRoot`: the container is the template root
 * or a <template>'s content, where content the parser would foster-parent stays in place.
 * Returns the error message, or undefined when the parser keeps the tag where it is written.
 */
export function startRepair(
  name: string,
  ctx: Context,
  atRoot: boolean,
  stack: readonly OpenElement[],
  hiddenInput: boolean,
): string | undefined {
  if (ctx !== 'body') {
    if (ALLOWED[ctx].has(name) || (ctx === 'table' && name === 'input' && hiddenInput)) return;
    if (atRoot && ctx !== 'colgroup' && !TABLE_PARTS.has(name)) return;
    return inTableMessage(name, ctx);
  }
  const top = stack.at(-1);
  if (TABLE_PARTS.has(name)) {
    return msg.repaired(
      `<${name}> outside its table structure is dropped by the parser`,
      `Put it where it belongs: <table><tbody><tr><td>…</td></tr></tbody></table>.`,
    );
  }
  if (CLOSES_P.has(name) && inScope(stack, 'p', 'button')) {
    return msg.repaired(
      `<${name}> inside <p>: a paragraph holds only phrasing content, so the parser closes it`,
      `Close </p> before <${name}>, or use a <div> instead of the <p>.`,
    );
  }
  if (name === 'li' && listItemOpen(stack, LI)) {
    return msg.repaired(
      '<li> inside another <li> closes the first one',
      'Close </li> first, or nest a list: <li>…<ul><li>…</li></ul></li>.',
    );
  }
  if ((name === 'dd' || name === 'dt') && listItemOpen(stack, DD_DT)) {
    return msg.repaired(`<${name}> inside <dd> or <dt> closes it`, 'Close it first.');
  }
  if (name === 'a' && formattingOpen(stack, 'a')) {
    return msg.repaired(
      "<a> inside <a>: links can't nest",
      'Close the first </a> before the next <a>.',
    );
  }
  if (
    name === 'form' &&
    stack.some((el) => isHtml(el, FORM)) &&
    !stack.some((el) => isHtml(el, TEMPLATE))
  ) {
    return msg.repaired(
      '<form> inside <form> is dropped by the parser',
      'Forms can\'t nest: close the first form, and point controls at a form with form="id".',
    );
  }
  if (HEADINGS.has(name) && isHtml(top, HEADINGS)) {
    return msg.repaired(`<${name}> inside a heading closes it`, 'Close the first heading first.');
  }
  if (name === 'button' && inScope(stack, 'button')) {
    return msg.repaired('<button> inside <button> closes the first one', "Buttons can't nest.");
  }
  if ((name === 'option' || name === 'optgroup') && isHtml(top, OPTION)) {
    return msg.repaired(`<${name}> inside <option> closes it`, 'Close </option> first.');
  }
  return undefined;
}

/** Rule 7 for static text: non-whitespace text in table structure is moved out of it. */
export function textRepair(raw: string, ctx: Context, atRoot: boolean): string | undefined {
  if (ctx === 'body' || !/[^\t\n\f\r ]/.test(raw) || (atRoot && ctx !== 'colgroup')) return;
  return msg.repaired(
    'Text directly inside table structure',
    'The parser moves it out of the table. Put text inside a <td>, <th> or <caption>.',
  );
}

/** Rule 7 in SVG/MathML: HTML tags that end the foreign element. */
export function breaksOutOfForeign(name: string, hasFontAttr: boolean): boolean {
  return BREAKOUT.has(name) || (name === 'font' && hasFontAttr);
}

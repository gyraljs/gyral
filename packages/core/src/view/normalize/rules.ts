// The template rules of view/09-template-rules.md that one template's strings reveal: every
// message says what is wrong and what to write instead (core belief 7). The tokenizer
// (rules 1, 2, 3, 5), the tree builder (3, 4, 6, 7, 10, 12, 13, 14, 15) and repairs.ts (7)
// throw them through Source.fail; the browser's own parse (prepare.ts) backs rule 7 up, and
// template-element.ts throws rule 11 when a server template reaches the browser.

import { SERVER_ONLY } from './errors.js';

const H = '${…}';

/** Rule 15's example tag: SignupForm → signup-form, Counter → my-counter. */
const kebab = (raw: string): string => {
  const name = raw.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return name.includes('-') ? name : `my-${name}`;
};

/** Messages, by rule. Each names the fix. */
export const msg = {
  // 1
  eventBinding: (name: string): string =>
    `${name}=${H} is an event binding, and Gyral has none: views never attach listeners. ` +
    `Name the intent instead, data-intent=\${i.Name}, and parse the event in the component's ` +
    `intent (ADR 0001).`,
  // 2
  dynamicTag: (): string =>
    `A hole can't be (part of) a tag name: <${H}> and </${H}> are not supported. Choose ` +
    `between whole templates instead: \${cond ? html\`<a>…</a>\` : html\`<b>…</b>\`}. ` +
    `For a literal "<" next to a value, write &lt;.`,
  dynamicName: (): string =>
    `A hole can't be (part of) an attribute name. Write the name statically (name=${H}), ` +
    `use ?name=${H} to add or remove it, or choose between whole templates.`,
  // 3
  inRawText: (tag: string): string =>
    `A hole can't sit inside <${tag}>: no part can live there, and values in it are an ` +
    `injection risk. Pass data through an attribute, styles through a CSS custom property ` +
    `(style=\${\`--x: \${v}\`}), or trusted markup through raw().`,
  inComment: (): string =>
    `A hole can't sit inside an HTML comment: no part can live there. Move the value out of ` +
    `the comment, or drop the comment.`,
  inDoctype: (): string =>
    `A hole can't sit inside <!doctype>. Write the doctype statically: <!doctype html>.`,
  inTemplate: (): string =>
    `A hole can't sit inside a <template> element: its content is inert and no part can live ` +
    `there. Render the content with a nested html\`…\` template in a child hole instead.`,
  // 4
  formState: (tag: string, name: string, write: string): string =>
    `.${name}=${H} on <${tag}> binds form state as a property, which never reaches the ` +
    `server and has a second spelling. Write ${write} instead: Gyral keeps it live ` +
    `(view/02-bindings.md, "Live form state").`,
  toggle: (tag: string, name: string): string =>
    name === 'modal'
      ? `modal on <${tag}>: only a <dialog> opens as a modal, and only from ?modal=${H}, which ` +
        `calls showModal() and close() as the value changes (view/02-bindings.md, "Dialogs and ` +
        `popovers"). Write <dialog ?modal=${H}>.`
      : `popover-open on <${tag}>: write ?popover-open=${H} on an element with a popover ` +
        `attribute; it calls showPopover() and hidePopover() as the value changes ` +
        `(view/02-bindings.md, "Dialogs and popovers").`,
  // 5
  unquoted: (name: string): string =>
    `${name}=… mixes static text and holes without quotes, which is ambiguous. Quote the ` +
    `whole value: ${name}="a ${H}".`,
  notSingle: (name: string): string =>
    `${name} takes exactly one value and no static text. Write ${name}=${H}, and build the ` +
    `value in the expression.`,
  // 6
  selfClosing: (tag: string): string =>
    `<${tag} /> is not self-closing in HTML: the parser ignores the "/", so <${tag}> would ` +
    `swallow the siblings that follow it. Write <${tag}></${tag}>.`,
  // 7
  repaired: (what: string, write: string): string =>
    `${what}. The HTML parser repairs this markup, so the DOM would differ from the template ` +
    `and part paths would shift. ${write}`,
  badEndTag: (): string =>
    `"</" must start an end tag such as </p>. For a literal "</" in text, write &lt;/.`,
  unterminated: (what: 'comment' | 'tag'): string =>
    what === 'comment'
      ? `The template ends inside a comment or <!…> declaration. Close it with -->.`
      : `The template ends inside a tag, so the parser would drop it. Close the tag with ">".`,
  // 10
  svgOnly: (tag: string): string =>
    `<${tag}> is an SVG element outside an <svg>: in an html template the parser creates SVG ` +
    `elements only inside <svg>. For an SVG fragment of its own, write it with the svg tag ` +
    `(import { svg } from '@gyral/core'): svg\`<${tag} …></${tag}>\`, rendered inside an <svg>. ` +
    `Or wrap it: <svg viewBox="…"><${tag} …></${tag}></svg>.`,
  htmlInSvg: (tag: string, top: boolean): string =>
    (top
      ? `<${tag}> is HTML, but this is an svg template: its top level is SVG content (it renders ` +
        `inside an <svg>), where the parser `
      : `<${tag}> is an HTML element inside SVG content, where the parser `) +
    `would not create an HTML <${tag}>. Write HTML with html\`…\`, or put it inside ` +
    `<foreignObject>.`,
  namespacedAttr: (name: string): string =>
    `${name}=${H} binds a namespaced attribute: the parser puts ${name} in its own namespace, ` +
    `and a bound value can't be. Bind the plain attribute instead (SVG 2): href=${H} for ` +
    `xlink:href, lang=${H} for xml:lang; write xmlns statically, if at all.`,
  // 11
  serverOnly: (): string => SERVER_ONLY,
  // 12
  textContent: (tag: string): string =>
    `A hole in <${tag}> must be its whole content. Write <${tag}>${H}</${tag}> and build the ` +
    `text in the value: <${tag}>\${\`\${page} | Site\`}</${tag}>.`,
  // 14
  booleanAttr: (tag: string, name: string): string =>
    `${name}=${H} on <${tag}> sets a boolean attribute to a string: any value, even "false", ` +
    `turns it on. Write ?${name}=${H} to add the attribute when the value is truthy and ` +
    `remove it otherwise.`,
  // 13
  charRef: (ref: string): string =>
    `&${ref}; in the static text of a bound or custom-element attribute is a named character ` +
    `reference the normalizer doesn't decode (it knows &amp; &lt; &gt; &quot; &apos; &nbsp;). ` +
    `Write the character itself, or a numeric reference such as &#169;.`,
  // 15
  componentName: (raw: string): string =>
    `<${raw}> looks like a component reference, but templates are HTML: the parser reads it as ` +
    `an unknown <${raw.toLowerCase()}> element, which renders nothing. Write the tag name the ` +
    `component was defined with, such as <${kebab(raw)}></${kebab(raw)}> for ` +
    `define()('${kebab(raw)}', …), and import the module that defines it.`,
};

/**
 * Rule 4: property bindings that would be form state (view/02-bindings.md "Live form state").
 * Returns the spelling to use instead, or undefined when the binding is fine.
 */
const FORM_STATE: Record<string, Record<string, string> | undefined> = {
  input: { value: `value=${H}`, checked: `?checked=${H}`, indeterminate: `?indeterminate=${H}` },
  textarea: { value: `<textarea>${H}</textarea>` },
  select: { value: `?selected=${H} on the chosen <option>` },
  option: { selected: `?selected=${H}`, value: `value=${H}` },
  details: { open: `?open=${H}` },
  dialog: { open: `?open=${H}`, modal: `?modal=${H}` },
};

/**
 * Rule 4: property bindings that would be form state (view/02-bindings.md "Live form state").
 * Returns the spelling to use instead, or undefined when the binding is fine.
 */
export function formStateFix(tag: string, name: string): string | undefined {
  return FORM_STATE[tag]?.[name];
}

/**
 * Rule 14: HTML boolean attributes (present means true). `hidden` is left out because
 * hidden="until-found" is a real string value.
 */
export const BOOLEAN_ATTRS = new Set(
  (
    'allowfullscreen async autofocus autoplay checked controls default defer disabled ' +
    'disablepictureinpicture disableremoteplayback formnovalidate inert ismap itemscope loop ' +
    'multiple muted nomodule novalidate open playsinline readonly required reversed selected ' +
    'shadowrootclonable shadowrootdelegatesfocus shadowrootserializable'
  ).split(' '),
);

/** Rule 10: SVG element names that HTML doesn't share (lower case). */
export const SVG_ONLY = new Set(
  (
    'animate animatemotion animatetransform circle clippath defs desc ellipse feblend ' +
    'fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting ' +
    'fedisplacementmap fedropshadow feflood fegaussianblur feimage femerge femergenode ' +
    'femorphology feoffset fespecularlighting fetile feturbulence filter foreignobject g line ' +
    'lineargradient marker mask metadata mpath path pattern polygon polyline radialgradient ' +
    'rect stop symbol text textpath tspan use'
  ).split(' '),
);

/** HTML void elements: no end tag, no content. */
export const VOID = new Set(
  (
    'area base basefont bgsound br col embed frame hr img input keygen link meta param source ' +
    'track wbr'
  ).split(' '),
);

/**
 * Rule 15: element names the HTML parser knows (lower case): WHATWG HTML's elements, obsolete
 * ones included, and the foreign roots. Any other name without a hyphen is an unknown element.
 */
export const KNOWN_HTML = new Set(
  (
    'a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound ' +
    'big blink blockquote body br button canvas caption center cite code col colgroup data ' +
    'datalist dd del details dfn dialog dir div dl dt em embed fencedframe fieldset figcaption ' +
    'figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i ' +
    'iframe image img input ins isindex kbd keygen label legend li link listing main map mark ' +
    'marquee math menu menuitem meta meter multicol nav nextid nobr noembed noframes noscript ' +
    'object ol optgroup option output p param picture plaintext portal pre progress q rb rp rt ' +
    'rtc ruby s samp script search section select selectedcontent slot small source spacer span ' +
    'strike strong style sub summary sup svg table tbody td template textarea tfoot th thead ' +
    'time title tr track tt u ul var video wbr xmp'
  ).split(' '),
);

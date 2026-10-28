// Rules 15 and 16 of view/09-template-rules.md, names the HTML parser lowercases. A PascalCase
// tag such as <SignupForm> is a JSX habit, read as an unknown element that renders nothing; a
// camelCase attribute on a custom element (playerBase=${…}) sets one no prop reads, since prop
// attributes are kebab-case. The tree builder runs these checks when it is given them: the
// compiler and the ESLint rule always pass them, the browser's runtime preparer only in
// development (prepare.ts), so production bundles built without the Vite preset don't carry
// the list of HTML element names.

/** Rules 15 and 16: each returns its message, or undefined when the name is fine. */
export interface NameChecks {
  /** A start tag's name: `raw` as written, `name` lower case. */
  readonly tag: (raw: string, name: string) => string | undefined;
  /** An attribute of a custom element in HTML content, as written; `bool` for `?name`. */
  readonly attribute: (tag: string, name: string, bool: boolean) => string | undefined;
}

/**
 * Element names the HTML parser knows (lower case), each between spaces: the elements of WHATWG
 * HTML, obsolete ones included, and the foreign roots. Any other name without a hyphen is an
 * unknown element. A string rather than a Set built at load, so bundles that never check drop it.
 */
const KNOWN_HTML =
  ' a abbr acronym address applet area article aside audio b base basefont bdi bdo ' +
  'bgsound big blink blockquote body br button canvas caption center cite code col ' +
  'colgroup data datalist dd del details dfn dialog dir div dl dt em embed fencedframe ' +
  'fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head ' +
  'header hgroup hr html i iframe image img input ins isindex kbd keygen label legend li ' +
  'link listing main map mark marquee math menu menuitem meta meter multicol nav nextid ' +
  'nobr noembed noframes noscript object ol optgroup option output p param picture ' +
  'plaintext portal pre progress q rb rp rt rtc ruby s samp script search section select ' +
  'selectedcontent slot small source spacer span strike strong style sub summary sup svg ' +
  'table tbody td template textarea tfoot th thead time title tr track tt u ul var video ' +
  'wbr xmp ';

/** playerBase → player-base: how a prop's attribute is named (prop.ts). */
const dashed = (raw: string): string => raw.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** The example tag: SignupForm → signup-form, Counter → my-counter. */
const kebab = (raw: string): string => {
  const name = dashed(raw);
  return name.includes('-') ? name : `my-${name}`;
};

/** Rule 15: `raw` as written, `name` lower case. */
export const componentName: NameChecks['tag'] = (raw, name) =>
  /^[A-Z]/.test(raw) && !name.includes('-') && !KNOWN_HTML.includes(` ${name} `)
    ? `<${raw}> looks like a component reference, but templates are HTML: the parser reads it ` +
      `as an unknown <${raw.toLowerCase()}> element, which renders nothing. Write the tag name ` +
      `the component was defined with, such as <${kebab(raw)}></${kebab(raw)}> for ` +
      `define()('${kebab(raw)}', …), and import the module that defines it.`
    : undefined;

const H = '${…}';

/** Rule 16: a camelCase attribute on a custom element, which HTML lowercases. */
export const attributeName: NameChecks['attribute'] = (tag, name, bool) => {
  if (!/[A-Z]/.test(name)) return undefined;
  const at = bool ? '?' : '';
  return (
    `<${tag}> ${at}${name}: HTML lowercases attribute names, so this sets ` +
    `"${name.toLowerCase()}", which no prop reads unless its attribute: names it (a prop ` +
    `${name} reads "${dashed(name)}"). Write the attribute in kebab-case, ` +
    `${at}${dashed(name)}=${H}, or set the property: .${name}=${H}.`
  );
};

/** Both checks, as the compiler, the ESLint rule and the development runtime pass them. */
export const nameChecks: NameChecks = { tag: componentName, attribute: attributeName };

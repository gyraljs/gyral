// Rule 15 of view/09-template-rules.md: a PascalCase tag such as <SignupForm> is a JSX habit,
// and the HTML parser reads it as an unknown element that renders nothing. The tree builder
// runs this check when it is given one: the compiler and the ESLint rule always pass it, the
// browser's runtime preparer only in development (prepare.ts), so production bundles built
// without the Vite preset don't carry the list of HTML element names.

/** Checks a start tag's name: the rule 15 message, or undefined when the name is fine. */
export type NameCheck = (raw: string, name: string) => string | undefined;

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

/** The example tag: SignupForm → signup-form, Counter → my-counter. */
const kebab = (raw: string): string => {
  const name = raw.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return name.includes('-') ? name : `my-${name}`;
};

/** Rule 15: `raw` as written, `name` lower case. */
export const componentName: NameCheck = (raw, name) =>
  /^[A-Z]/.test(raw) && !name.includes('-') && !KNOWN_HTML.includes(` ${name} `)
    ? `<${raw}> looks like a component reference, but templates are HTML: the parser reads it ` +
      `as an unknown <${raw.toLowerCase()}> element, which renders nothing. Write the tag name ` +
      `the component was defined with, such as <${kebab(raw)}></${kebab(raw)}> for ` +
      `define()('${kebab(raw)}', …), and import the module that defines it.`
    : undefined;

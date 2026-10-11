// SVG content in the normalizer (view/01-templates.md "svg templates", view/09-template-rules.md
// rule 10), from WHATWG HTML "Parsing main inside foreign content" and "adjust SVG attributes":
// the HTML tokenizer lower-cases attribute names, then the tree builder restores the camelCase
// of SVG's own attributes. Bound attribute names on SVG elements are spelled the same way, so
// `viewbox=${v}` binds viewBox, as the parser does for the server's markup. HTML elements that
// are not SVG elements, inside SVG content, are rule 10 (they would be created as unknown SVG
// elements that render nothing); the ones that end the SVG element are in repairs.ts.

/** WHATWG HTML's "adjust SVG attributes" table: lower case → the SVG spelling. */
const CAMEL =
  'attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits ' +
  'diffuseConstant edgeMode filterUnits glyphRef gradientTransform gradientUnits kernelMatrix ' +
  'kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight ' +
  'markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength ' +
  'patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ ' +
  'preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur ' +
  'requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod ' +
  'startOffset stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX ' +
  'targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan';
const ATTRS = new Map(CAMEL.split(' ').map((name) => [name.toLowerCase(), name]));

/** A bound attribute's name on an SVG element, as the parser spells it. */
export const svgAttr = (name: string): string => {
  const lower = name.toLowerCase();
  return ATTRS.get(lower) ?? lower;
};

/**
 * HTML elements that are not SVG elements, and that don't end SVG content either (those are
 * repairs.ts's BREAKOUT): inside SVG content the parser creates an unknown SVG element.
 */
export const HTML_ONLY = new Set(
  (
    'abbr address area article aside audio bdi bdo button canvas caption cite col colgroup ' +
    'data datalist del details dfn dialog fieldset figcaption figure footer form header hgroup ' +
    'html iframe input ins kbd label legend main map mark meter nav noscript object optgroup ' +
    'option output picture progress q rp rt samp search section select slot source summary ' +
    'tbody td template textarea tfoot th thead time tr track video wbr'
  ).split(' '),
);

/** HTML integration points in SVG: their content is HTML (WHATWG HTML, tree construction). */
export const SVG_HTML_POINT = /^(foreignobject|desc|title)$/;

/**
 * A bound attribute the renderer can't set with `setAttribute` the way the parser would: the
 * parser puts xlink:*, xml:* and xmlns* attributes in their own namespaces.
 */
export const namespacedAttr = (name: string): boolean => /^(xlink:|xml:|xmlns)/i.test(name);

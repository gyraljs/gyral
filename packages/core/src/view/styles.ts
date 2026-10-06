// Component styles (view/08-styles.md "Authoring", "Browser"): the `css` tag and the shared
// sheets. A style source is CSS text plus a cache slot for its one `CSSStyleSheet`, created on
// first use with `replaceSync`; components that share a source share the sheet. Plain strings
// are style sources too (cached by text). The server reads the text (06), never the sheet.

const STYLE: unique symbol = Symbol('gyral.css');

/** What `css` returns: CSS text, mapped to one shared `CSSStyleSheet` in the browser. */
export interface StyleSource {
  readonly [STYLE]: true;
  readonly text: string;
}

/**
 * What `spec.styles` accepts: `css` values, plain CSS strings (e.g.
 * `import base from './base.css?inline'`) and arrays of them, nested freely. CSS is trusted
 * author code: never interpolate user input.
 */
export type Styles = StyleSource | string | readonly Styles[];

/** A `css` interpolation: inserted as written (another `css` value inserts its text). */
export type CssValue = string | number | StyleSource;

export const isStyleSource = (value: unknown): value is StyleSource =>
  typeof value === 'object' && value !== null && STYLE in value;

/**
 * Component CSS: `css\`p { margin-block: ${GAP}px; }\``. Strings and numbers are inserted as
 * written, so values from your own constants need no wrapper.
 */
export function css(strings: TemplateStringsArray, ...values: readonly CssValue[]): StyleSource {
  let text = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    text += (isStyleSource(v) ? v.text : String(v)) + (strings[i + 1] ?? '');
  }
  return { [STYLE]: true, text };
}

/** The CSS texts of `styles`, flattened in order (the server writes them, 06). */
export function styleTexts(styles: Styles | undefined): string[] {
  if (styles === undefined) return [];
  if (typeof styles === 'string') return [styles];
  if (isStyleSource(styles)) return [styles.text];
  return styles.flatMap(styleTexts);
}

const bySource = new WeakMap<StyleSource, CSSStyleSheet>();
const byText = new Map<string, CSSStyleSheet>();

function sheetOf(text: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
}

/** One shared sheet per style source (or per distinct string), created on first use. */
export function sheetsFor(styles: Styles | undefined): CSSStyleSheet[] {
  if (styles === undefined) return [];
  if (typeof styles === 'string') {
    let sheet = byText.get(styles);
    if (sheet === undefined) {
      sheet = sheetOf(styles);
      byText.set(styles, sheet);
    }
    return [sheet];
  }
  if (isStyleSource(styles)) {
    let sheet = bySource.get(styles);
    if (sheet === undefined) {
      sheet = sheetOf(styles.text);
      bySource.set(styles, sheet);
    }
    return [sheet];
  }
  return styles.flatMap(sheetsFor);
}

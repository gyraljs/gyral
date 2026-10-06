// Escaping for the server renderer (view/06-server.md "Escaping"). Text escapes `&`, `<` and
// `>`; double-quoted attribute values escape `&` and `"`; the single-quoted seed attribute
// escapes `&` and `'` (so its JSON's double quotes stay raw). WHATWG HTML "Serializing HTML
// fragments" escapes the same characters; nothing else can end a text run or a quoted value.

const TEXT = /[&<>]/g;
const ATTR = /[&"]/g;
const SEED = /[&']/g;

const ENTITY: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const entity = (c: string): string => ENTITY[c] ?? c;

/** Text content (child holes, `<textarea>`/`<title>` content). */
export function escapeText(text: string): string {
  TEXT.lastIndex = 0;
  return TEXT.test(text) ? text.replace(TEXT, entity) : text;
}

/** A double-quoted attribute value. */
export function escapeAttr(value: string): string {
  ATTR.lastIndex = 0;
  return ATTR.test(value) ? value.replace(ATTR, entity) : value;
}

/** A single-quoted attribute value: the `data-gyral-seed` JSON. */
export const escapeSeed = (json: string): string => json.replace(SEED, entity);

/** CSS for a `<style>` element: `</style` (any case) would end it; `<\/style` is the same CSS. */
export const styleSafe = (css: string): string => css.replace(/<\/(style)/gi, '<\\/$1');

/** HTML whitespace (WHATWG "ASCII whitespace"): text made only of it stays in table structure. */
export const onlyWhitespace = (text: string): boolean => !/[^\t\n\f\r ]/.test(text);

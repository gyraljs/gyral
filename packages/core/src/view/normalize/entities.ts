// Character references in attribute text the client sets itself: the static pieces of a
// multi-attribute and a custom element's static attributes (its props on the server). The
// WHATWG named-reference table has over 2,000 entries, so only numeric references and the
// common names are decoded; any other `&name;` is rule 13 (proposed). Text and plain static
// attributes are never decoded here: they stay in the template HTML for the browser to parse.

const NAMED: Record<string, string | undefined> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const REF = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g;

function codePoint(n: number): string {
  const invalid = n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff);
  return String.fromCodePoint(invalid ? 0xfffd : n);
}

/** Decodes `raw`; `unknown(name)` is called (and must throw) for an unsupported name. */
export function decodeRefs(raw: string, unknown: (name: string) => never): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(REF, (_, ref: string) => {
    if (ref.startsWith('#x') || ref.startsWith('#X')) return codePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith('#')) return codePoint(parseInt(ref.slice(1), 10));
    return NAMED[ref] ?? unknown(ref);
  });
}

/** The value of a static attribute as written (`"a"`, `'a'`, `a`), without its quotes. */
export function unquote(value: string): string {
  const q = value.charAt(0);
  return (q === '"' || q === "'") && value.endsWith(q) && value.length >= 2
    ? value.slice(1, -1)
    : value;
}

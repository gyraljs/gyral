// Where a template rule error is in the source (@gyral/core/eslint, view/09-template-rules.md).
// The normalizer reports the string and offset it stopped at, in the whitespace-minified cooked
// strings. Three maps lead back to the file: minified → cooked (whitespace runs the minifier
// collapsed or dropped), cooked → source text (escapes, line continuations and CRLF, which the
// cooked string spells differently), and the quasi's place in the file.

/** One quasi of a template literal: where its text starts in the file, and its offset map. */
export interface Quasi {
  /** File offset of the quasi's first character (after the backtick or `}`). */
  readonly start: number;
  /** File offset where the quasi's text ends (at the closing backtick or `${`). */
  readonly end: number;
  /** For each cooked offset (and one past the end), the offset in the source text. */
  readonly map: readonly number[];
}

const SIMPLE: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
};
const LINE_END = /[\n\r\u2028\u2029]/;

/** The length of the escape sequence at `k` (after its backslash) and the text it cooks to. */
function escape(text: string, k: number): { length: number; value: string } {
  const c = text.charAt(k);
  const simple = SIMPLE[c];
  if (simple !== undefined) return { length: 1, value: simple };
  if (c === '\r') return { length: text.charAt(k + 1) === '\n' ? 2 : 1, value: '' };
  if (LINE_END.test(c)) return { length: 1, value: '' };
  if (c === '0' && !/[0-9]/.test(text.charAt(k + 1))) return { length: 1, value: '\0' };
  const hex =
    c === 'x'
      ? /^x([0-9a-fA-F]{2})/.exec(text.slice(k))
      : c === 'u'
        ? /^u(?:([0-9a-fA-F]{4})|\{([0-9a-fA-F]+)\})/.exec(text.slice(k))
        : null;
  if (hex !== null) {
    const code = Number.parseInt(hex[1] ?? hex[2] ?? '0', 16);
    return { length: hex[0].length, value: String.fromCodePoint(code) };
  }
  return { length: c.length, value: c };
}

/**
 * Maps each offset of the cooked string to the source text it came from. Returns undefined when
 * decoding `text` doesn't give `cooked` (the caller then points at the quasi's start).
 */
export function cookedMap(text: string, cooked: string): number[] | undefined {
  const map: number[] = [];
  let out = '';
  let k = 0;
  while (k < text.length) {
    const c = text.charAt(k);
    let length = 1;
    let value = c;
    if (c === '\\') {
      const e = escape(text, k + 1);
      length = 1 + e.length;
      value = e.value;
    } else if (c === '\r') {
      length = text.charAt(k + 1) === '\n' ? 2 : 1;
      value = '\n';
    }
    for (let n = 0; n < value.length; n++) map.push(k);
    out += value;
    k += length;
  }
  map.push(text.length);
  return out === cooked ? map : undefined;
}

const isWs = (c: string): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Maps each offset of `minified` (and one past its end) to `original`. The minifier only
 * collapses a whitespace run to one space or drops it, and copies everything else.
 */
export function minifiedMap(original: string, minified: string): number[] {
  const map: number[] = [];
  let a = 0;
  for (let b = 0; b < minified.length; b++) {
    const c = minified.charAt(b);
    // A dropped run: skip it.
    while (c !== ' ' && isWs(original.charAt(a)) && original.charAt(a) !== c) a++;
    map.push(a);
    // A run collapsed to this space (one that starts with a space is copied char by char,
    // and its rest skipped as dropped before the next character).
    if (c === ' ' && original.charAt(a) !== ' ' && isWs(original.charAt(a))) {
      while (isWs(original.charAt(a))) a++;
    } else if (a < original.length) a++;
  }
  map.push(original.length);
  return map;
}

/** A source range, as file offsets. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A position in the normalizer's minified strings: string index, offset (view/normalize/check.ts). */
type At = readonly [index: number, offset: number];

/**
 * The range to report for a template's first error: the token the tree builder was handling
 * (a tag, an end tag, text) when it has one; the whole `${…}` when the error is at a hole
 * (including `<${…}>`, where the tag name would be); else the character the tokenizer stopped at.
 */
export function errorSpan(
  quasis: readonly Quasi[],
  originals: readonly string[],
  minified: readonly string[],
  at: At,
  from: At | undefined,
): Span {
  const maps = minified.map((m, i) => minifiedMap(originals[i] ?? '', m));
  /** File offset where minified character `off` of string `i` starts. */
  const startOf = (i: number, off: number): number => {
    const q = quasis[i];
    return q === undefined ? 0 : q.start + (q.map[maps[i]?.[off] ?? 0] ?? 0);
  };
  /** File offset just after minified character `off - 1` of string `i`. */
  const endOf = (i: number, off: number): number => {
    const q = quasis[i];
    if (q === undefined) return 0;
    if (off <= 0) return q.start;
    return q.start + (q.map[(maps[i]?.[off - 1] ?? 0) + 1] ?? 0);
  };
  const [index, offset] = at;
  const s = minified[index] ?? '';
  const quasi = quasis[index];
  const next = quasis[index + 1];
  if (quasi === undefined) return { start: 0, end: 0 };
  if (from !== undefined && (from[0] < index || from[1] < offset)) {
    return { start: startOf(from[0], from[1]), end: endOf(index, offset) };
  }
  if (next !== undefined && /^(<\/?)?$/.test(s.slice(offset))) {
    return { start: offset < s.length ? startOf(index, offset) : quasi.end, end: next.start };
  }
  if (offset < s.length) return { start: startOf(index, offset), end: endOf(index, offset + 1) };
  return s.length > 0
    ? { start: startOf(index, s.length - 1), end: endOf(index, s.length) }
    : { start: quasi.end, end: quasi.end + 1 };
}

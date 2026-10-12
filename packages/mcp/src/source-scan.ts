// Cheap source scanning for check_snippet's Gyral checks: comments blanked out (strings and
// template literals kept), and the text of one spec property's value.

/**
 * `code` with comments replaced by spaces (newlines kept, so offsets and lines still match).
 * Strings and template literals are kept as written; `${…}` inside templates is code again.
 */
export function blankComments(code: string): string {
  let out = '';
  // The brace depth at which each open `${` hole of a template literal began.
  const holes: number[] = [];
  let depth = 0;
  let i = 0;
  /** Copies template text from `i` up to its closing backtick or its next hole. */
  const template = (): void => {
    while (i < code.length) {
      const c = code.charAt(i);
      if (c === '\\') {
        out += code.slice(i, i + 2);
        i += 2;
      } else if (c === '`') {
        out += c;
        i++;
        return;
      } else if (c === '$' && code.charAt(i + 1) === '{') {
        out += '${';
        i += 2;
        holes.push(depth++);
        return;
      } else {
        out += c;
        i++;
      }
    }
  };
  while (i < code.length) {
    const c = code.charAt(i);
    const next = code.charAt(i + 1);
    if (c === '/' && next === '/') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === "'" || c === '"') {
      out += c;
      i++;
      while (i < code.length && code.charAt(i) !== c && code.charAt(i) !== '\n') {
        if (code.charAt(i) === '\\') out += code.charAt(i++);
        out += code.charAt(i++);
      }
      out += code.charAt(i++);
    } else if (c === '`') {
      out += c;
      i++;
      template();
    } else if (c === '{') {
      depth++;
      out += c;
      i++;
    } else if (c === '}') {
      depth--;
      out += c;
      i++;
      if (holes.length > 0 && holes[holes.length - 1] === depth) {
        holes.pop();
        template();
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** The 1-based line of `offset`. */
export const lineAt = (code: string, offset: number): number =>
  code.slice(0, offset).split('\n').length;

/**
 * The value of each `name:` property or `name(…) {` method in `code` (as text, with its
 * offset): from after the colon to the comma or closing brace that ends it at its own depth.
 */
export function propertyValues(
  code: string,
  name: string,
): { readonly start: number; readonly text: string }[] {
  const found: { start: number; text: string }[] = [];
  const pattern = new RegExp(`(?<![\\w.$])${name}\\s*(?::|\\()`, 'g');
  for (const match of code.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let depth = match[0].endsWith('(') ? 1 : 0;
    let end = start;
    for (; end < code.length; end++) {
      const c = code[end];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
        // A method: its body's closing brace ends it.
        if (depth === 0 && c === '}' && match[0].endsWith('(')) {
          end++;
          break;
        }
      } else if (c === ',' && depth === 0) break;
    }
    found.push({ start, text: code.slice(start, end) });
  }
  return found;
}

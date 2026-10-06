// The template corpus for the browser check (prepare.test.ts): every `html`/`serverHtml`
// tagged template in the examples (views, servers, tests) and the packages' sources and tests, extracted from their sources with a
// small template-literal scanner (cooked strings, nested templates found separately).

const sources = import.meta.glob<string>(
  [
    '../../../../examples/*/{src,server,test}/**/*.ts',
    '../../../*/{src,test}/**/*.ts',
    '!../../../core/{src,test}/view/**',
    // The compiler's sources and tests hold templates inside strings (messages, fixture apps).
    '!../../../core/{src,test}/compiler/**',
    // Written and deleted by scripts/test/eslint-guardrails.test.mjs while tests run.
    '!../../../*/src/**/__lint_fixture_*',
    '!../../../create-gyral/**',
  ],
  { query: '?raw', import: 'default', eager: true },
);

export interface CorpusTemplate {
  readonly file: string;
  readonly strings: readonly string[];
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0' };

/** Skips a quoted string or comment starting at `k`; returns the index after it. */
function skipQuoted(src: string, k: number): number {
  const q = src.charAt(k);
  if (q === '/' && src.charAt(k + 1) === '/') return src.indexOf('\n', k) + 1 || src.length;
  if (q === '/' && src.charAt(k + 1) === '*') return src.indexOf('*/', k + 2) + 2;
  if (q === '`') return readTemplate(src, k).end;
  for (let j = k + 1; j < src.length; j++) {
    if (src.charAt(j) === '\\') j++;
    else if (src.charAt(j) === q) return j + 1;
  }
  return src.length;
}

/** Reads the template literal whose backtick is at `start`. */
function readTemplate(src: string, start: number): { strings: string[]; end: number } {
  const strings: string[] = [];
  let current = '';
  let k = start + 1;
  while (k < src.length) {
    const c = src.charAt(k);
    if (c === '\\') {
      const e = src.charAt(k + 1);
      current += ESCAPES[e] ?? e;
      k += 2;
    } else if (c === '`') {
      strings.push(current);
      return { strings, end: k + 1 };
    } else if (c === '$' && src.charAt(k + 1) === '{') {
      strings.push(current);
      current = '';
      let depth = 1;
      k += 2;
      while (k < src.length && depth > 0) {
        const d = src.charAt(k);
        if (d === '{') depth++;
        if (d === '}') depth--;
        if (d === "'" || d === '"' || d === '`' || (d === '/' && /[/*]/.test(src.charAt(k + 1)))) {
          k = skipQuoted(src, k);
        } else k++;
      }
    } else {
      current += c;
      k++;
    }
  }
  return { strings, end: src.length };
}

/** Every `html`/`serverHtml` tagged template in `src`. */
export function extractTemplates(src: string): string[][] {
  const found: string[][] = [];
  for (const match of src.matchAll(/\b(?:html|serverHtml)`/g)) {
    found.push(readTemplate(src, match.index + match[0].length - 1).strings);
  }
  return found;
}

export const corpus: readonly CorpusTemplate[] = Object.entries(sources).flatMap(([file, src]) =>
  extractTemplates(src).map((strings) => ({ file: file.replace(/^(\.\.\/)+/, ''), strings })),
);

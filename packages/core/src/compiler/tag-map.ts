// Component discovery and generated element typings (gyral-1zd.22, gyral-1zd.25). One scan of
// an app's sources for two-call `define<…>()('tag', …)` calls, read from the source text (not a
// type check; comments and string or template text are skipped, gyral-lbg), shared by automatic component loading (./components.ts) and the typings: every
// exported component becomes an `HTMLElementTagNameMap` entry, so apps stop hand-writing
// `declare global { interface HTMLElementTagNameMap { … } }` blocks. Node built-ins only, so
// ../vite.ts loads it with Node's require, from TypeScript source too.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import type { ElementTypesOptions } from '../vite.js';

export interface TagMapOptions {
  /** Project root; `dirs` and `out` are relative to it. */
  readonly root: string;
  /** Source directories to scan, recursively. Default `['src']`. */
  readonly dirs?: readonly string[];
  /** The declaration file to write. Default `.gyral/elements.d.ts`. */
  readonly out?: string;
}

export interface TagEntry {
  readonly tag: string;
  readonly file: string;
  readonly name: string;
}

/** One `define()`d component: its tag, the file defining it and, if exported, its binding. */
export interface Discovered {
  readonly tag: string;
  /** Absolute path of the defining module. */
  readonly file: string;
  /** `X` in `export const X = define…`; undefined for a component that isn't exported. */
  readonly name: string | undefined;
}

/**
 * A two-call `define<…>()(` and the quote opening its tag, optionally as `export const Name = …`:
 * the generics (lazy, so nested `<…>` extend it), the empty call, then a string. Run on
 * `blankInert` text, so it never matches inside a comment or a string. `customElements.define(`
 * doesn't match.
 */
const DEFINE_CALL =
  /(?:export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*)?(?<![.\w$])define\s*(?:<[\s\S]*?>)?\s*\(\s*\)\s*\(\s*(['"`])/g;
/** A custom element name as a literal tag: lowercase, with a hyphen, no `${…}`. */
const TAG = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const SKIPPED = /\.(?:test|spec|d)\.[cm]?[jt]sx?$/;
const WORD = /[\w$]/;
/** Keywords after which `/` starts a regular expression literal rather than a division. */
const REGEX_AFTER = new Set(
  'return typeof instanceof in of new delete void throw case do else yield await'.split(' '),
);
/** Tokens that end an operand, so a `/` after them is a division. */
const OPERAND_END = [')', ']', '`', "'", '"', '++', '--'];
/** Whether `/` after the code token `last` (a word or punctuator) starts a regular expression. */
const startsRegex = (last: string): boolean =>
  WORD.test(last.charAt(0)) ? REGEX_AFTER.has(last) : !OPERAND_END.includes(last);

/**
 * `code` with every comment, and the text of every string, template and regular expression
 * literal, replaced by spaces. Line breaks, quotes and offsets are kept, so a string's span is
 * still visible but not its content, and code inside a template's `${…}` is still code. A small
 * tokenizer for JavaScript and TypeScript without JSX, not a parser: `/` after `)`, `]`, a
 * literal or an identifier other than a keyword is a division, anywhere else it opens a regular
 * expression (one that doesn't close on its line is read as a division after all).
 */
export function blankInert(code: string): string {
  const out = code.split('');
  const n = code.length;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < Math.min(to, n); k++)
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  /** Per open `${`, how many `{` inside it are still open. */
  const braces: number[] = [];
  let last = '';
  let i = code.startsWith('#!') ? code.indexOf('\n') : 0;
  if (i === -1) i = n;
  blank(0, i);
  while (i < n) {
    const c = code.charAt(i);
    const next = code.charAt(i + 1);
    if (c === '/' && (next === '/' || next === '*')) {
      const close = next === '/' ? code.indexOf('\n', i) : code.indexOf('*/', i + 2);
      const end = close === -1 ? n : next === '/' ? close : close + 2;
      blank(i, end);
      i = end;
    } else if (c === "'" || c === '"') {
      let k = i + 1;
      while (k < n && code[k] !== c && code[k] !== '\n') k += code[k] === '\\' ? 2 : 1;
      blank(i + 1, k);
      i = k + 1;
      last = c;
    } else if (c === '`' || (c === '}' && braces.at(-1) === 0)) {
      if (c === '}') braces.pop();
      let k = i + 1;
      while (k < n && code[k] !== '`' && !(code[k] === '$' && code[k + 1] === '{'))
        k += code[k] === '\\' ? 2 : 1;
      blank(i + 1, k);
      const opens = code[k] === '$';
      if (opens) braces.push(0);
      i = opens ? k + 2 : k + 1;
      last = opens ? '{' : '`';
    } else if (c === '/' && startsRegex(last)) {
      let k = i + 1;
      let inClass = false;
      while (k < n && code[k] !== '\n' && (inClass || code[k] !== '/')) {
        if (code[k] === '\\') k++;
        else if (code[k] === '[') inClass = true;
        else if (code[k] === ']') inClass = false;
        k++;
      }
      const closed = code[k] === '/';
      if (closed) blank(i + 1, k);
      i = closed ? k + 1 : i + 1;
      last = closed ? ')' : '/';
    } else if (WORD.test(c)) {
      let k = i + 1;
      while (k < n && WORD.test(code.charAt(k))) k++;
      last = code.slice(i, k);
      i = k;
    } else {
      const top = braces.length - 1;
      if (top >= 0 && c === '{') braces[top] = (braces[top] ?? 0) + 1;
      if (top >= 0 && c === '}') braces[top] = (braces[top] ?? 1) - 1;
      const twice = (c === '+' || c === '-') && next === c;
      if (!/\s/.test(c)) last = twice ? c + c : c;
      i += twice ? 2 : 1;
    }
  }
  return out.join('');
}

/** The components defined in one module's source text. */
export function componentsIn(code: string, file: string): Discovered[] {
  if (!code.includes('define')) return [];
  const text = blankInert(code);
  const out: Discovered[] = [];
  for (const m of text.matchAll(DEFINE_CALL)) {
    const open = m.index + m[0].length - 1;
    const close = text.indexOf(m[2] as string, open + 1);
    const tag = close === -1 ? '' : code.slice(open + 1, close);
    if (TAG.test(tag)) out.push({ tag, file, name: m[1] });
  }
  return out;
}

/** Every component under `dirs` (relative to `root`), in file then source order. */
export function discoverComponents(root: string, dirs: readonly string[]): Discovered[] {
  const found: Discovered[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(path);
        continue;
      }
      if (!SOURCE_FILE.test(entry.name) || SKIPPED.test(entry.name)) continue;
      found.push(...componentsIn(readFileSync(path, 'utf8'), path));
    }
  };
  for (const dir of dirs) walk(resolve(root, dir));
  return found;
}

/** Every exported component under `dirs` (default `['src']`), sorted by tag. */
export function scanTags(options: TagMapOptions): TagEntry[] {
  const entries = discoverComponents(options.root, options.dirs ?? ['src']).flatMap((c) =>
    c.name === undefined ? [] : [{ tag: c.tag, file: c.file, name: c.name }],
  );
  return entries.sort((x, y) => (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0));
}

/** The import specifier for `file` from `outFile`: relative, `.js` for TypeScript sources. */
function specifier(outFile: string, file: string): string {
  const path = relative(dirname(outFile), file).split(sep).join('/');
  const js = path.replace(/\.tsx?$/, '.js').replace(/\.mts$/, '.mjs');
  return js.startsWith('.') ? js : `./${js}`;
}

/** The declaration file's text for `entries`, written to `outFile`. */
export function tagMapSource(entries: readonly TagEntry[], outFile: string): string {
  const lines = entries.map(
    (e) =>
      `    ${JSON.stringify(e.tag)}: InstanceType<typeof import(${JSON.stringify(specifier(outFile, e.file))}).${e.name}>;`,
  );
  return (
    '/* eslint-disable */\n' +
    '// Generated by @gyral/core (gyralVitePreset / gyral-types) from the define() calls in your\n' +
    '// sources. Do not edit; gitignore .gyral/ and add ".gyral/elements.d.ts" to tsconfig "include".\n' +
    'export {};\n\n' +
    'declare global {\n' +
    '  interface HTMLElementTagNameMap {\n' +
    (lines.length === 0 ? '' : `${lines.join('\n')}\n`) +
    '  }\n' +
    '}\n'
  );
}

/**
 * Scans the sources and writes the declaration file when its content changed. Returns the
 * entries and whether the file was written.
 */
export function writeTagMap(options: TagMapOptions): { entries: TagEntry[]; written: boolean } {
  const outFile = join(options.root, options.out ?? '.gyral/elements.d.ts');
  const entries = scanTags(options);
  const text = tagMapSource(entries, outFile);
  if (existsSync(outFile) && readFileSync(outFile, 'utf8') === text)
    return { entries, written: false };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, text);
  return { entries, written: true };
}

/** The preset's `gyral:element-types` plugin (`gyralVitePreset({ types })`). */
export function elementTypesPlugin(options: ElementTypesOptions): Plugin {
  let root = process.cwd();
  const regenerate = (): void => {
    const settings = { root, ...options };
    const out = join(root, options.out ?? '.gyral/elements.d.ts');
    // A project without components gets no file.
    if (scanTags(settings).length === 0 && !existsSync(out)) return;
    writeTagMap(settings);
  };
  const isSource = (file: string): boolean =>
    /\.(?:ts|tsx|mts)$/.test(file) &&
    (options.dirs ?? ['src']).some((dir) => file.startsWith(join(root, dir)));
  return {
    name: 'gyral:element-types',
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      regenerate();
    },
    watchChange(id) {
      if (isSource(id)) regenerate();
    },
    configureServer(server) {
      const changed = (file: string): void => {
        if (isSource(file)) regenerate();
      };
      server.watcher.on('add', changed).on('change', changed).on('unlink', changed);
    },
  };
}

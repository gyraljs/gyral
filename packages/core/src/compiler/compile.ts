// Compiles one module's `html` call sites (view/01-templates.md "Compiled"): each call site's
// cooked strings go through the same normalizer as the runtime path (so ids match), parse5
// double-checks rule 7, one module-level constant is hoisted per template object, and the
// call becomes `compiled(<const>, [values…])`. Line breaks inside a rewritten template are
// kept, so every following line keeps its number; the source map covers columns.
import { analyze, TemplateError, type TemplateObject } from '../view/index.js';
import type { Node } from './ast.js';
import { nodeAt, nodesAt } from './ast.js';
import { checkWithParse5, type Parse5 } from './parse5-check.js';
import type { HtmlImport } from './scan.js';
import { splice, type Edit, type Lines, type SourceMap } from './source.js';

/** Where a source's `compiled` lives when its `html` module isn't the one to import it from. */
const COMPILED_ENTRIES: Readonly<Record<string, string>> = {
  '@gyral/core': '@gyral/core/compiled',
};

/** A build error at `start`–`end` of the module (the plugin adds the code frame). */
export class CompileError extends Error {
  constructor(
    readonly start: number,
    readonly end: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CompileInput {
  readonly lines: Lines;
  /** Module id, and its path relative to the root (for messages). */
  readonly id: string;
  readonly file: string;
  readonly sites: readonly { readonly node: Node; readonly binding: HtmlImport }[];
  /** Server build: keep the server segments. */
  readonly ssr: boolean;
  readonly parse5: Parse5 | undefined;
  /** Template id → normalized strings and call site, for the whole build (collisions). */
  readonly seen: Map<string, { readonly strings: string; readonly loc: string }>;
}

/** The template object as emitted: no `loc` (production), no `segments` in client builds. */
function emitted(template: TemplateObject, ssr: boolean): object {
  const { id, html, parts, server, segments } = template;
  return ssr ? { id, html, parts, server, segments } : { id, html, parts, server };
}

const newlines = (text: string): string => '\n'.repeat(text.split('\n').length - 1);

/** Edits turning html`a${x}b${y}c` into `callee(name, [x, y])`, keeping line breaks. */
function siteEdits(code: string, node: Node, callee: string, name: string): Edit[] {
  const values = nodesAt(nodeAt(node, 'quasi') ?? node, 'expressions');
  const first = values[0];
  const last = values.at(-1);
  if (first === undefined || last === undefined) {
    const nl = newlines(code.slice(node.start, node.end));
    return [{ start: node.start, end: node.end, text: `${callee}(${name}, [${nl}])` }];
  }
  const edit = (start: number, end: number, text: string): Edit => ({
    start,
    end,
    text: text + newlines(code.slice(start, end)),
  });
  const edits = [edit(node.start, first.start, `${callee}(${name}, [`)];
  for (let k = 1; k < values.length; k++) {
    const prev = values[k - 1];
    const next = values[k];
    if (prev !== undefined && next !== undefined) edits.push(edit(prev.end, next.start, ', '));
  }
  edits.push({
    start: last.end,
    end: node.end,
    text: `${newlines(code.slice(last.end, node.end))}])`,
  });
  return edits;
}

/** The cooked strings of a tagged template (what the tag receives at runtime). */
function cookedStrings(node: Node): string[] {
  return nodesAt(nodeAt(node, 'quasi') ?? node, 'quasis').map((q) => {
    const cooked = (q['value'] as { cooked?: unknown } | undefined)?.cooked;
    if (typeof cooked !== 'string') {
      throw new CompileError(
        q.start,
        q.end,
        'This html template has an invalid escape sequence, so it has no string value at ' +
          'runtime. Fix the escape (write \\\\ for a backslash).',
      );
    }
    return cooked;
  });
}

/** Rewrites every call site in the module; nested templates inside values are included. */
export function compileModule(input: CompileInput): { code: string; map: SourceMap } {
  const { lines, sites, seen } = input;
  const { code } = lines;
  let prefix = '_gyral$';
  for (let n = 1; code.includes(prefix); n++) prefix = `_gyral${String(n)}$`;
  const callees = new Map<string, string>();
  const consts = new Map<string, string>();
  const decls: string[] = [];
  const edits: Edit[] = [];
  for (const { node, binding } of sites) {
    const { line, column } = lines.position(node.start);
    const loc = `${input.file}:${String(line)}:${String(column + 1)}`;
    let analysis;
    try {
      analysis = analyze(cookedStrings(node), loc);
    } catch (error) {
      if (error instanceof TemplateError)
        throw new CompileError(node.start, node.end, error.message);
      throw error;
    }
    const { template, shape } = analysis;
    const strings = JSON.stringify(analysis.strings);
    const known = seen.get(template.id);
    if (known !== undefined && known.strings !== strings) {
      throw new CompileError(
        node.start,
        node.end,
        `Two different templates share the id ${template.id} (this one and ${known.loc}), so ` +
          `server output and hydration could confuse them. Change one slightly (for example add ` +
          `a class) and report the collision (view/01-templates.md "Template ids").`,
      );
    }
    seen.set(template.id, { strings, loc });
    const repaired = input.parse5 && checkWithParse5(input.parse5, template, shape);
    if (repaired) throw new CompileError(node.start, node.end, repaired.message);
    let name = consts.get(template.id);
    if (name === undefined) {
      name = `${prefix}t${String(consts.size)}`;
      consts.set(template.id, name);
      decls.push(`const ${name} = ${JSON.stringify(emitted(template, input.ssr))};`);
    }
    const entry = COMPILED_ENTRIES[binding.specifier] ?? binding.specifier;
    let callee = callees.get(entry);
    if (callee === undefined) {
      callee = `${prefix}compiled${callees.size === 0 ? '' : String(callees.size)}`;
      callees.set(entry, callee);
    }
    edits.push(...siteEdits(code, node, callee, name));
  }
  const imports = [...callees].map(
    ([entry, local]) => `import { compiled as ${local} } from ${JSON.stringify(entry)};`,
  );
  // Prepended to the first line (after a hashbang), so no line moves.
  const at = code.startsWith('#!') ? code.indexOf('\n') + 1 : 0;
  edits.unshift({ start: at, end: at, text: [...imports, ...decls].join('') });
  return splice(lines, edits, input.id);
}

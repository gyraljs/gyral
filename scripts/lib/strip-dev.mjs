// Core's production build without its development code (gyral-gpr, ADR 0018 "Production build
// without development code"). Core guards every development check with `if (DEV)` (and its
// devtools hooks with `if (DEVTOOLS_ENABLED)`), flags imported from `#view-dev` and `#devtools`,
// whose production modules export a literal `false`. Rollup and Rolldown carry that constant
// across modules and drop the checks; esbuild and other bundlers keep them, and every module
// only they import. This pass does the bundler's part once, per module: the flags become
// `false`, esbuild folds the branches away (minifySyntax) and drops what only they used (unused
// imports, as in TypeScript, and unused top-level code), again until nothing changes.
import { transform } from 'esbuild';
import ts from 'typescript';

/** The flags, by exported name: `false` in production. */
export const FLAGS = new Set(['DEV', 'DEVTOOLS_ENABLED']);
/** Core's own modules that define the flags; core's other modules may re-export them. */
const FLAG_SOURCES = new Set(['#view-dev', '#devtools']);
const MAX_PASSES = 6;

const isRelative = (specifier) => specifier.startsWith('./') || specifier.startsWith('../');
const quote = (text) => JSON.stringify(text);
const parse = (code, file) =>
  ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

/** `{ a, b as c }` for the kept specifiers of a named import or export. */
const named = (elements) =>
  `{ ${elements
    .map((e) =>
      e.propertyName === undefined ? e.name.text : `${e.propertyName.text} as ${e.name.text}`,
    )
    .join(', ')} }`;

/** The string literal of a static import or export, or of an import() call. */
function specifierOf(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const spec = node.moduleSpecifier;
    return spec !== undefined && ts.isStringLiteral(spec) ? spec : undefined;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [arg] = node.arguments;
    return arg !== undefined && ts.isStringLiteral(arg) ? arg : undefined;
  }
  return undefined;
}

/** Every node of `source` with a module specifier, in source order. */
function moduleReferences(source) {
  const found = [];
  const visit = (node) => {
    if (specifierOf(node) !== undefined) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `code` with the edits (start, end, text) applied. */
function applyEdits(code, edits) {
  let out = code;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + text + out.slice(end);
  }
  return out;
}

const isBare = (node) => ts.isImportDeclaration(node) && node.importClause === undefined;

/**
 * Turns the flags into free names: each import of a flag is removed (its local name returned,
 * to be defined as `false`), each re-export becomes `export const name = false`, and every
 * module specifier goes through `specifier`. `bare`: the side-effect imports the module had.
 */
function rewriteModuleSyntax(code, file, specifier) {
  const source = parse(code, file);
  const edits = [];
  const locals = new Set();
  const bare = new Set();
  const target = (spec) => specifier(spec) ?? spec;
  const isFlag = (element, spec) =>
    (FLAG_SOURCES.has(spec) || isRelative(spec)) &&
    FLAGS.has((element.propertyName ?? element.name).text);

  for (const node of moduleReferences(source)) {
    const spec = specifierOf(node);
    if (spec === undefined) continue;
    const from = quote(target(spec.text));
    const range = [node.getStart(source), node.end];
    const imported = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined;
    const exported = ts.isExportDeclaration(node) ? node.exportClause : undefined;
    if (isBare(node)) bare.add(target(spec.text));
    if (imported !== undefined && ts.isNamedImports(imported)) {
      const flags = imported.elements.filter((e) => isFlag(e, spec.text));
      for (const element of flags) locals.add(element.name.text);
      const kept = imported.elements.filter((e) => !flags.includes(e));
      const name = node.importClause?.name;
      const head = [
        ...(name === undefined ? [] : [name.text]),
        ...(kept.length > 0 ? [named(kept)] : []),
      ];
      edits.push([...range, head.length === 0 ? '' : `import ${head.join(', ')} from ${from};`]);
    } else if (exported !== undefined && ts.isNamedExports(exported)) {
      const flags = exported.elements.filter((e) => isFlag(e, spec.text));
      const kept = exported.elements.filter((e) => !flags.includes(e));
      const parts = flags.map((e) => `export const ${e.name.text} = false;`);
      if (kept.length > 0) parts.unshift(`export ${named(kept)} from ${from};`);
      edits.push([...range, parts.join('\n')]);
    } else {
      edits.push([spec.getStart(source), spec.end, from]);
    }
  }
  return { code: applyEdits(code, edits), locals, bare };
}

/**
 * Removes side-effect imports the module didn't have (not in `bare`): esbuild keeps
 * `import "./x.js"` when the only uses of x's bindings were in code it removed. Core's modules
 * have no side effects (`sideEffects: false`), so such an import only keeps x in the graph.
 */
function dropNewBareImports(code, file, bare) {
  const source = parse(code, file);
  const edits = source.statements
    .filter((node) => isBare(node) && !bare.has(specifierOf(node)?.text ?? ''))
    .map((node) => [node.getStart(source), node.end, '']);
  return applyEdits(code, edits);
}

/** Static and dynamic import specifiers of a module, each once. */
export function importsOf(code, file = 'module.js') {
  const specifiers = moduleReferences(parse(code, file)).map((node) => specifierOf(node)?.text);
  return [...new Set(specifiers)].filter((s) => s !== undefined);
}

const inlineMap = (map) =>
  `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString('base64')}`;

/**
 * `code` (one ES module of core, JavaScript) without its development code. `specifier` maps a
 * module specifier to its replacement (undefined: unchanged). `sourcemap: true` returns a map
 * of the change; with `map` (the module's own source map, JSON), the returned map leads to the
 * original sources.
 */
export async function stripDevelopment(
  code,
  { file = 'module.js', specifier = () => undefined, sourcemap = false, map } = {},
) {
  const input = code.replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n');
  const rewritten = rewriteModuleSyntax(input, file, specifier);
  const define = Object.fromEntries([...FLAGS, ...rewritten.locals].map((name) => [name, 'false']));
  let current = { code: rewritten.code, map };
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = await transform(
      current.code + (current.map === undefined ? '' : inlineMap(current.map)),
      {
        loader: 'ts', // unused imports are dropped, as TypeScript drops them
        format: 'esm',
        target: 'es2022',
        define,
        minifySyntax: true,
        treeShaking: true,
        sourcefile: file,
        sourcemap: sourcemap || map !== undefined ? 'external' : false,
        sourcesContent: true,
        tsconfigRaw: {
          compilerOptions: { useDefineForClassFields: false, verbatimModuleSyntax: false },
        },
      },
    );
    const next = {
      code: dropNewBareImports(result.code, file, rewritten.bare),
      map: result.map === '' ? undefined : result.map,
    };
    if (next.code === current.code) return next;
    current = next;
  }
  throw new Error(`${file}: development code still changing after ${String(MAX_PASSES)} passes`);
}

/**
 * A Vite plugin that strips core's modules as the production build does, for tests that run
 * core's sources as its production build (vitest.config.ts, the browser-prod project).
 */
export function stripDevelopmentPlugin({ include }) {
  return {
    name: 'gyral:strip-development',
    enforce: 'post',
    async transform(code, id) {
      const file = id.replace(/\?.*$/, '');
      if (!include.test(file) || !/\.[jt]s$/.test(file)) return null;
      const stripped = await stripDevelopment(code, { file, sourcemap: true });
      return { code: stripped.code, map: stripped.map ?? null };
    },
  };
}

// Writes dist/corpus.json, everything the server answers from (run after tsc by `pnpm build`):
// - docs: data/llms-full.txt (a committed snapshot of https://gyral.dev/llms-full.txt, so builds
//   are offline and deterministic; refresh it with `pnpm mcp:refresh` before a release, or with
//   `pnpm mcp:refresh --from ../gyral.dev/dist` from a local site build)
// - api: the public exports of every published entry point, read with the TypeScript compiler
//   from this repo's sources (the same approach as the gyral.dev API reference)
// - examples: examples/*, skill: skills/gyral, llmsTxt: data/llms.txt
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgDir = join(import.meta.dirname, '..');
const repo = join(pkgDir, '..', '..');
const read = (path) => readFileSync(path, 'utf8');

/**
 * Published packages and entry points, in reading order (`@gyral/core/compiled` is for the
 * template compiler's output, `@gyral/ssr/hydrate` an empty 0.2 leftover: neither is listed).
 */
const ENTRIES = [
  ['core', ['.', './storage', './indexeddb', './vite', './eslint']],
  ['http', ['.', './sse', './websocket', './testing']],
  ['router', ['.']],
  ['time', ['.']],
  ['ssr', ['.', './static', './node']],
  ['testing', ['.', './vitest']],
  ['devtools', ['.']],
];

const tidy = (text) =>
  text
    .replace(/^export\s+(default\s+)?/, '')
    .replace(/^declare\s+/, '')
    .trimEnd();

function declarationText(node, name, checker) {
  const source = node.getSourceFile().text;
  const upTo = (n, end) => tidy(source.slice(n.getStart(), end));
  if (ts.isFunctionDeclaration(node)) return upTo(node, node.body?.getStart() ?? node.end);
  if (ts.isClassDeclaration(node)) {
    const header = upTo(node, node.members.pos)
      .replace(/\{\s*$/, '')
      .trimEnd();
    const hidden = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;
    const members = node.members
      .filter((m) => !(m.name !== undefined && ts.isPrivateIdentifier(m.name)))
      .filter((m) => (ts.getCombinedModifierFlags(m) & hidden) === 0)
      .map((m) => {
        const end = 'body' in m && m.body !== undefined ? m.body.getStart() : m.end;
        return `  ${source.slice(m.getStart(), end).trim().replace(/;?$/, ';')}`;
      });
    return `${header} {\n${members.join('\n')}\n}`;
  }
  if (ts.isVariableDeclaration(node)) {
    const type = checker.typeToString(
      checker.getTypeAtLocation(node),
      undefined,
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );
    return `const ${name}: ${type}`;
  }
  return upTo(node, node.end);
}

/** A function's overload signatures (every one, without the implementation), else its declaration. */
function overloadsOf(symbol) {
  const declarations = symbol.declarations ?? [];
  const overloads = declarations.filter((d) => ts.isFunctionDeclaration(d) && d.body === undefined);
  return overloads.length > 1 ? overloads : declarations.slice(0, 1);
}

function kindOf(node, checker) {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isVariableDeclaration(node)) {
    return checker.getTypeAtLocation(node).getCallSignatures().length > 0 ? 'function' : 'constant';
  }
  return 'type';
}

/** `node_modules/vite/dist/node/index.d.ts` → `vite`; `@types/node/http.d.ts` → `node:http`. */
function moduleOf(file) {
  const at = file.lastIndexOf('node_modules/');
  if (at === -1) return undefined;
  const rest = file.slice(at + 'node_modules/'.length).split('/');
  if (rest[0] === '@types' && rest[1] === 'node') return `node:${rest[2]?.replace(/\.d\.ts$/, '')}`;
  if (rest[0] === '@types') return rest[1];
  return rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
}

/**
 * Types that public declarations reference but no entry point exports (a spec field's type, a
 * helper of `ComponentSpec`, Vite's `Plugin`), with the exports that use them: get_api tells an
 * agent how to name one instead of failing on it.
 */
function internalTypes(roots, checker) {
  const exportedNames = new Set(roots.map((r) => r.name));
  const exportedSymbols = new Set(roots.map((r) => r.symbol));
  const found = new Map();
  const note = (symbol, user) => {
    const file = symbol.declarations?.[0]?.getSourceFile().fileName ?? '';
    if (/\/typescript\/lib\//.test(file) || exportedNames.has(symbol.name)) return;
    const from = moduleOf(file);
    const entry = found.get(symbol.name) ?? {
      name: symbol.name,
      usedBy: [],
      ...(from ? { from } : {}),
    };
    if (!entry.usedBy.includes(user)) entry.usedBy.push(user);
    found.set(symbol.name, entry);
  };
  for (const { name, specifier, kind, symbol } of roots) {
    const user = `${name} (${kind}, ${specifier})`;
    const visit = (node) => {
      if (ts.isFunctionLike(node) && 'body' in node && node.body !== undefined) {
        node.typeParameters?.forEach(visit);
        node.parameters.forEach(visit);
        if (node.type) visit(node.type);
        return;
      }
      if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
        const id = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
        let target = checker.getSymbolAtLocation(ts.isQualifiedName(id) ? id.left : id);
        if (target && target.flags & ts.SymbolFlags.Alias)
          target = checker.getAliasedSymbol(target);
        if (
          target &&
          !exportedSymbols.has(target) &&
          !(target.flags & ts.SymbolFlags.TypeParameter)
        )
          note(target, user);
      }
      ts.forEachChild(node, visit);
    };
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration)) {
        if (declaration.type) visit(declaration.type);
      } else if (ts.isClassDeclaration(declaration)) {
        declaration.heritageClauses?.forEach(visit);
        const hidden = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;
        for (const member of declaration.members) {
          if (member.name !== undefined && ts.isPrivateIdentifier(member.name)) continue;
          if ((ts.getCombinedModifierFlags(member) & hidden) === 0) visit(member);
        }
      } else visit(declaration);
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function buildApi() {
  const entries = ENTRIES.flatMap(([name, subpaths]) => {
    const dir = join(repo, 'packages', name);
    const json = JSON.parse(read(join(dir, 'package.json')));
    return subpaths.map((subpath) => ({
      specifier: subpath === '.' ? json.name : `${json.name}${subpath.slice(1)}`,
      file: join(dir, json.exports[subpath]),
    }));
  });
  const program = ts.createProgram({
    rootNames: entries.map((e) => e.file),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    },
  });
  const checker = program.getTypeChecker();
  const roots = [];
  const api = entries.flatMap(({ specifier, file }) => {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (module === undefined) throw new Error(`build-corpus: cannot read ${file}`);
    return checker.getExportsOfModule(module).map((exported) => {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const node = symbol.declarations?.[0];
      if (node === undefined) throw new Error(`build-corpus: ${exported.name} has no declaration`);
      const doc = ts.displayPartsToString(symbol.getDocumentationComment(checker));
      const kind = kindOf(node, checker);
      roots.push({ name: exported.name, specifier, kind, symbol });
      return {
        name: exported.name,
        specifier,
        kind,
        declaration: overloadsOf(symbol)
          .map((n) => declarationText(n, exported.name, checker))
          .join('\n'),
        doc,
      };
    });
  });
  return { api, internalTypes: internalTypes(roots, checker) };
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory())
      return e.name === 'node_modules' || e.name === 'test' ? [] : sourceFiles(path);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path] : [];
  });
}

function buildExamples(docs) {
  const gallery = docs.find((p) => p.url === 'https://gyral.dev/examples/');
  const root = join(repo, 'examples');
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .filter((name) => {
      try {
        return statSync(join(root, name, 'package.json')).isFile();
      } catch {
        return false;
      }
    })
    .map((name) => {
      const dir = join(root, name);
      const json = JSON.parse(read(join(dir, 'package.json')));
      const url = `https://github.com/gyraljs/gyral/tree/main/examples/${name}`;
      const section = gallery?.sections.find(
        (s) => s.body.includes(`${url}\n`) || s.body.endsWith(url),
      );
      const paragraph = section?.body.split('\n\n')[0]?.replace(/\s+/g, ' ').trim();
      const files = ['src', 'server']
        .map((sub) => join(dir, sub))
        .filter((sub) => {
          try {
            return statSync(sub).isDirectory();
          } catch {
            return false;
          }
        })
        .flatMap(sourceFiles)
        .sort();
      const component = (file) => /\bdefine(<[^>]*>)?\(/.test(read(file));
      return {
        name,
        title: section?.heading ?? name,
        description: paragraph ?? json.description ?? '',
        url,
        components: files
          .filter(component)
          .map((f) => ({ path: relative(dir, f), source: read(f) })),
        otherFiles: files.filter((f) => !component(f)).map((f) => relative(dir, f)),
      };
    });
}

function buildSkill() {
  const dir = join(repo, 'skills', 'gyral');
  const refs = readdirSync(join(dir, 'references'))
    .filter((f) => f.endsWith('.md'))
    .sort();
  return [
    { path: 'SKILL.md', content: read(join(dir, 'SKILL.md')) },
    ...refs.map((f) => ({ path: `references/${f}`, content: read(join(dir, 'references', f)) })),
  ];
}

/** The corpus, given the docs parser (dist/docs.js when building, src/docs.ts in tests). */
export function buildCorpus(parseLlmsFull) {
  const docs = parseLlmsFull(read(join(pkgDir, 'data', 'llms-full.txt')));
  if (docs.length < 10) throw new Error(`build-corpus: only ${docs.length} docs pages parsed`);
  const { api, internalTypes } = buildApi();
  return {
    version: JSON.parse(read(join(pkgDir, 'package.json'))).version,
    docs,
    api,
    internalTypes,
    examples: buildExamples(docs),
    skill: buildSkill(),
    llmsTxt: read(join(pkgDir, 'data', 'llms.txt')),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { parseLlmsFull } = await import('../dist/docs.js');
  const corpus = buildCorpus(parseLlmsFull);
  const json = JSON.stringify(corpus);
  writeFileSync(join(pkgDir, 'dist', 'corpus.json'), json);
  console.log(
    `corpus: ${corpus.docs.length} pages, ${corpus.api.length} API entries, ${corpus.examples.length} examples, ${corpus.skill.length} skill files (${(Buffer.byteLength(json) / 1024).toFixed(0)} KiB)`,
  );
}

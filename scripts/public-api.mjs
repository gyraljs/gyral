// The public API inventory (gyral-1zd.6): every export of every published entry point, listed in
// docs/references/public-api-0.3.1.md between the inventory markers.
//   node scripts/public-api.mjs          → rewrite the inventory (status and doc links included)
//   node scripts/public-api.mjs --check  → fail when an entry point exports something the
//                                          inventory doesn't list, or the inventory lists
//                                          something no entry point exports (part of
//                                          `pnpm invariants`)
// An export is "documented" when the skill, a spec, an ADR, docs/references or a package README
// names it; otherwise a type is a "supporting type" (a parameter, option or result type of a
// documented API, described by its doc comment). `@gyral/core/internal` is "internal": Gyral's
// own packages share it with core, outside semver. Adding a value export without documenting
// it fails the check.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
const DOC = join(ROOT, 'docs/references/public-api-0.3.1.md');
const START = '<!-- inventory:start -->';
const END = '<!-- inventory:end -->';
const INTERNAL = '@gyral/core/internal';

/** Published entry points: package name + subpath → source file (workspace `exports`). */
function entryPoints() {
  const entries = [];
  for (const dir of readdirSync(join(ROOT, 'packages')).sort()) {
    const file = join(ROOT, 'packages', dir, 'package.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    if (manifest.private) continue;
    for (const [key, value] of Object.entries(manifest.exports ?? {})) {
      if (typeof value !== 'string' || !value.endsWith('.ts')) continue;
      const spec = key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`;
      entries.push({ spec, file: resolve(ROOT, 'packages', dir, value) });
    }
  }
  return entries;
}

/** Every export of every entry point: { spec, name, kind: 'value' | 'type' }, sorted. */
function readExports() {
  const entries = entryPoints();
  const program = ts.createProgram(
    entries.map((e) => e.file),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
    },
  );
  const checker = program.getTypeChecker();
  const out = [];
  for (const { spec, file } of entries) {
    const source = program.getSourceFile(file);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!symbol) throw new Error(`${relative(ROOT, file)}: not a module`);
    for (const exported of checker.getExportsOfModule(symbol)) {
      const target =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const kind = target.flags & ts.SymbolFlags.Value ? 'value' : 'type';
      out.push({ spec, name: exported.name, kind });
    }
  }
  const order = new Map(entries.map((e, i) => [e.spec, i]));
  return out.sort(
    (a, b) => order.get(a.spec) - order.get(b.spec) || a.name.localeCompare(b.name, 'en'),
  );
}

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? markdownFiles(join(dir, e.name))
      : e.name.endsWith('.md')
        ? [join(dir, e.name)]
        : [],
  );
}

/** Docs that count as documenting an export, most user-facing first. */
function docSources() {
  const readmes = readdirSync(join(ROOT, 'packages'))
    .map((d) => join(ROOT, 'packages', d, 'README.md'))
    .filter(existsSync);
  const files = [
    ...markdownFiles(join(ROOT, 'skills/gyral')),
    ...readmes,
    ...markdownFiles(join(ROOT, 'docs/design-docs/view')),
    ...markdownFiles(join(ROOT, 'docs/references')).filter(
      (f) => f !== DOC && !f.includes('capability-audit'),
    ),
    ...markdownFiles(join(ROOT, 'docs/design-docs')).filter((f) => !f.includes('/view/')),
  ];
  // Only code counts (fenced blocks and inline code), so English words like "run" or "page"
  // don't make an export look documented.
  return files.map((file) => {
    const text = readFileSync(file, 'utf8');
    const code = [...text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map((m) => m[0]).join('\n');
    return { file, text: code, full: text };
  });
}

function inventory(exports) {
  const docs = docSources();
  const lines = [];
  let spec;
  for (const e of exports) {
    if (e.spec !== spec) {
      spec = e.spec;
      lines.push('', `### \`${spec}\``, '', '| Export | Kind | Status | Documented in |');
      lines.push('| --- | --- | --- | --- |');
    }
    const pattern = new RegExp(`(?<![\\w$.\\-])${e.name.replace(/\$/g, '\\$')}(?![\\w$\\-])`);
    // Prefer a page that also names the export's package (`createServer` in @gyral/mcp's README,
    // not @gyral/ssr's Node server).
    const pkg = spec
      .split('/')
      .slice(0, spec.startsWith('@') ? 2 : 1)
      .join('/');
    const matches = docs.filter((d) => pattern.test(d.text));
    const doc = matches.find((d) => d.full.includes(pkg)) ?? matches[0];
    const link = doc
      ? `[${relative(join(ROOT, 'docs/references'), doc.file).replace(/^(\.\.\/)+/, '')}](${relative(join(ROOT, 'docs/references'), doc.file)})`
      : '';
    const status =
      spec === INTERNAL
        ? 'internal'
        : doc
          ? 'documented'
          : e.kind === 'type'
            ? 'supporting type'
            : 'UNDOCUMENTED';
    lines.push(`| \`${e.name}\` | ${e.kind} | ${status} | ${spec === INTERNAL ? '' : link} |`);
  }
  return lines.join('\n');
}

/** The (spec, name, kind) rows the inventory lists. */
function listed(text) {
  const rows = new Set();
  let spec;
  for (const line of text.split('\n')) {
    const heading = /^### `([^`]+)`/.exec(line);
    if (heading) spec = heading[1];
    const row = /^\|\s*`([^`]+)`\s*\|\s*(value|type)\s*\|/.exec(line);
    if (row && spec) rows.add(`${spec} ${row[1]} ${row[2]}`);
  }
  return rows;
}

const text = readFileSync(DOC, 'utf8');
const start = text.indexOf(START);
const end = text.indexOf(END);
if (start < 0 || end < start) throw new Error(`${relative(ROOT, DOC)}: inventory markers missing`);
const exports = readExports();

if (process.argv.includes('--check')) {
  const actual = new Set(exports.map((e) => `${e.spec} ${e.name} ${e.kind}`));
  const inDoc = listed(text.slice(start, end));
  const missing = [...actual].filter((r) => !inDoc.has(r));
  const extra = [...inDoc].filter((r) => !actual.has(r));
  const undocumented = text
    .slice(start, end)
    .match(/^\|\s*`[^`]+`\s*\|\s*value\s*\|\s*UNDOCUMENTED.*$/gm);
  const problems = [
    ...missing.map((r) => `exported but not in the inventory: ${r}`),
    ...extra.map((r) => `in the inventory but not exported: ${r}`),
    ...(undocumented ?? []).map((r) => `undocumented value export: ${r}`),
  ];
  if (problems.length > 0) {
    console.error(
      `${problems.join('\n')}\nDocument new exports, then run node scripts/public-api.mjs.`,
    );
    process.exit(1);
  }
  console.log(`public API: ${actual.size} exports, all in ${relative(ROOT, DOC)}`);
} else {
  const body = `${text.slice(0, start + START.length)}\n${inventory(exports)}\n\n${text.slice(end)}`;
  writeFileSync(DOC, await format(body, { ...(await resolveConfig(DOC)), filepath: DOC }));
  console.log(`wrote ${relative(ROOT, DOC)} (${exports.length} exports)`);
}

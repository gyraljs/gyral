// Typechecks every ```ts block in the Gyral agent skill (skills/gyral) against the workspace
// packages, so the skill can't drift from the real API (gyral-7se.1). Each block is compiled as
// its own module: write complete snippets (imports included), or use a ```text fence for
// fragments that are not meant to compile.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(root, 'skills', 'gyral');
const outDir = join(root, '.skill-check');

/** Every `ts`/`typescript` fenced block in a markdown file, with its line number. */
export function tsBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(ts|typescript)\s*$/.exec(lines[i] ?? '');
    if (open === null) continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && lines[end] !== '```') end++;
    blocks.push({ line: start + 1, code: lines.slice(start, end).join('\n') });
    i = end;
  }
  return blocks;
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

/** tsconfig `paths` for every @gyral/* export, pointing at the workspace sources. */
function gyralPaths() {
  const paths = {};
  for (const name of readdirSync(join(root, 'packages'))) {
    const manifest = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'));
    if (!manifest.name.startsWith('@gyral/') || manifest.exports === undefined) continue;
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      if (typeof target !== 'string') continue;
      const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
      paths[specifier] = [relative(outDir, join(root, 'packages', name, target))];
    }
  }
  return paths;
}

function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const sources = [];
  for (const file of markdownFiles(skillDir)) {
    for (const block of tsBlocks(readFileSync(file, 'utf8'))) {
      const name = `${relative(skillDir, file).replace(/[^a-z0-9]+/gi, '_')}_L${String(block.line)}.ts`;
      writeFileSync(join(outDir, name), `${block.code}\n`);
      sources.push({ name, origin: `${relative(root, file)}:${String(block.line)}` });
    }
  }
  if (sources.length === 0) throw new Error('check-skill: no ts blocks found in skills/gyral');
  const tsconfig = {
    extends: '../tsconfig.base.json',
    compilerOptions: {
      noEmit: true,
      declaration: false,
      sourceMap: false,
      types: ['node', 'vite/client'],
      paths: gyralPaths(),
    },
    include: ['*.ts'],
  };
  writeFileSync(join(outDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  try {
    execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(outDir, 'tsconfig.json')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const named = sources.reduce(
      (text, s) => text.replaceAll(`.skill-check/${s.name}`, `${s.origin} (block)`),
      output,
    );
    console.error(`check-skill: skill code blocks don't typecheck:\n${named}`);
    process.exitCode = 1;
    return;
  }
  rmSync(outDir, { recursive: true, force: true });
  console.log(`check-skill: ${String(sources.length)} code blocks typecheck`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

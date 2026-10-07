// Clean-room guard (ADR 0018, decision J; view/README.md "Clean room"): fails when Gyral's code,
// tests, examples, scripts or agent skill contain Lit's internal identifiers or markers, import
// a Lit package, or declare one as a dependency. Gyral's view layer, server renderer and
// hydration are written from Gyral's own specs (docs/design-docs/view/) and the web-platform
// standards, not adapted from Lit; any of these names means code, a protocol or the old
// dependency came back. Historical design docs (docs/design-docs/) may still describe Lit.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * What must stay free of Lit provenance, as globs relative to the repo root (`*` is one path
 * segment, a trailing `/**` everything below).
 */
export const CLEAN_ROOM_PATHS = [
  'packages/*/src/**',
  'packages/*/test/**',
  'packages/*/bench/**',
  'packages/*/scripts/**',
  'packages/*/templates/**',
  'packages/*/package.json',
  'packages/*/README.md',
  'examples/**',
  'scripts/**',
  'skills/**',
  'package.json',
  'pnpm-workspace.yaml',
];

/** This guard and its test, which have to spell out what they look for. */
export const OWN_FILES = ['scripts/check-provenance.mjs', 'scripts/test/check-provenance.test.mjs'];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite', '.ui-check', '.demos']);
const TEXT_FILE = /\.(?:[cm]?[jt]s|json|md|html|css|ya?ml)$/;

/** Lit's internal identifiers and hydration/SSR markers. */
export const LIT_MARKERS = [
  '_$litType$',
  '$lit$',
  'lit-part',
  'lit-node',
  'litHtmlVersions',
  'litElementHydrateSupport',
  '_$litDirective$',
  '_$litPart$',
];

/** Lit's packages: lit, lit-html, lit-element, @lit/*, @lit-labs/*. */
const LIT_PACKAGE = /^(?:lit(?:-html|-element)?|@lit(?:-labs)?\/[^/]+)(?:\/.*)?$/;

const LIT_IMPORT =
  /\b(?:from|import)\s*\(?\s*['"]((?:lit(?:-html|-element)?|@lit(?:-labs)?\/[^'"]+)(?:\/[^'"]*)?)['"]/g;

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
];

/** Lit packages a package.json declares (dependencies of any kind, overrides). */
export function findLitDependencies(file, text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return [];
  }
  return DEPENDENCY_FIELDS.flatMap((field) =>
    [...Object.keys(manifest?.[field] ?? {}), ...Object.keys(manifest?.pnpm?.[field] ?? {})]
      .filter((name) => LIT_PACKAGE.test(name))
      .map((name) => `${file}: declares "${name}" in ${field}`),
  );
}

/** Every provenance problem in one file's text, as messages. */
export function findLitProvenance(file, text) {
  const problems = [];
  text.split('\n').forEach((line, k) => {
    const at = `${file}:${String(k + 1)}`;
    for (const marker of LIT_MARKERS) {
      if (line.includes(marker)) problems.push(`${at}: contains the Lit marker "${marker}"`);
    }
    for (const match of line.matchAll(LIT_IMPORT)) {
      problems.push(`${at}: imports "${match[1]}"`);
    }
  });
  if (file.endsWith('package.json')) problems.push(...findLitDependencies(file, text));
  if (/\.ya?ml$/.test(file)) {
    text.split('\n').forEach((line, k) => {
      const key = /^\s*['"]?([^'":\s]+)['"]?\s*:/.exec(line)?.[1];
      if (key !== undefined && LIT_PACKAGE.test(key)) {
        problems.push(`${file}:${String(k + 1)}: declares "${key}"`);
      }
    });
  }
  return problems;
}

const toRegExp = (glob) =>
  new RegExp(
    `^${glob
      .split('/')
      .map((part) =>
        part === '**' ? '.*' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
      )
      .join('/')}$`,
  );

/** Whether a repo-relative path is in the clean room. */
export function inCleanRoom(path) {
  if (OWN_FILES.includes(path)) return false;
  return CLEAN_ROOM_PATHS.some((glob) => toRegExp(glob).test(path));
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') && entry.isDirectory()) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : files(path);
    return TEXT_FILE.test(entry.name) ? [path] : [];
  });
}

/** Repo-relative paths of every text file the guard reads. */
export function cleanRoomFiles() {
  return ['packages', 'examples', 'scripts', 'skills']
    .flatMap((dir) => files(join(root, dir)))
    .map((file) => relative(root, file))
    .concat(['package.json', 'pnpm-workspace.yaml'])
    .filter(inCleanRoom);
}

function main() {
  const paths = cleanRoomFiles();
  const problems = paths.flatMap((path) =>
    findLitProvenance(path, readFileSync(join(root, path), 'utf8')),
  );
  if (problems.length > 0) {
    console.error(
      `check-provenance: Lit provenance in Gyral's clean room:\n  ${problems.join('\n  ')}\n` +
        `Gyral renders with its own view layer, written clean-room from docs/design-docs/view/ ` +
        `and the web-platform specs (ADR 0018, "Clean room"), so its code stays provably its ` +
        `own and its dependency tree stays free of Lit. Don't copy Lit's code, names or markers, ` +
        `don't import or depend on Lit packages, and don't open Lit's source while working on ` +
        `Gyral. Use Gyral's own names (e.g. <!--gyral:ID--> markers, view/06-server.md).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`check-provenance: ${String(paths.length)} files free of Lit provenance`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

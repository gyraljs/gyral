// Clean-room guard for Gyral's own view layer (ADR 0018, decision J): fails when a file in the
// directories below contains Lit identifiers or markers, or imports a Lit package. The view
// layer is written from Gyral's specs and the web-platform standards, not adapted from Lit, so
// any of these names means code (or a protocol) was carried over. Grows with each phase.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories that must stay free of Lit provenance (relative to the repo root). */
export const CLEAN_ROOM_DIRS = ['packages/core/src'];

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

const LIT_IMPORT =
  /\b(?:from|import)\s*\(?\s*['"]((?:lit(?:-html|-element)?|@lit(?:-labs)?\/[^'"]+)(?:\/[^'"]*)?)['"]/g;

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
  return problems;
}

function sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function main() {
  const problems = CLEAN_ROOM_DIRS.flatMap((dir) =>
    sourceFiles(join(root, dir)).flatMap((file) =>
      findLitProvenance(relative(root, file), readFileSync(file, 'utf8')),
    ),
  );
  if (problems.length > 0) {
    console.error(
      `check-provenance: Lit identifiers in Gyral's clean-room view layer:\n  ${problems.join('\n  ')}\n` +
        `The view layer is written only from docs/design-docs/view/ and the web-platform specs ` +
        `(ADR 0018, "Clean room"): don't copy Lit's code, names or markers, and don't import ` +
        `Lit there. Use Gyral's own names (e.g. <!--gyral:ID--> markers, view/06-server.md).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`check-provenance: ${CLEAN_ROOM_DIRS.join(', ')} free of Lit identifiers`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// The docs snapshot's API pages come from the release's own declarations (gyral-ns9): gyral.dev
// renders them from the @gyral/* it reads, so a release branch built against the previous
// release on npm shipped 0.3.5's doc comments in @gyral/mcp 0.3.6. Once a release is cut (no
// changesets pending), the snapshot must carry its version, and each documented @gyral/core
// function and constant must read as the source does. While changesets are pending, the snapshot
// trails the source on purpose and this skips.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildCorpus } from '../scripts/build-corpus.mjs';
import { parseLlmsFull } from '../src/docs.js';

const root = new URL('../../../', import.meta.url);
const pending = readdirSync(new URL('.changeset/', root)).filter(
  (f) => f.endsWith('.md') && f !== 'README.md',
);
const release = (
  JSON.parse(readFileSync(new URL('packages/core/package.json', root), 'utf8')) as {
    version: string;
  }
).version;
const snapshot = readFileSync(new URL('packages/mcp/data/llms-full.txt', root), 'utf8');

const words = (text: string): string => text.replace(/\s+/g, ' ').trim();
/** A doc comment's first paragraph (an example after it renders as a code block on the page). */
const firstParagraph = (doc: string): string => words(doc.split(/\n\s*\n/)[0] ?? '');

it.skipIf(pending.length > 0)('carries the release version and its doc comments', () => {
  expect(/^# Gyral (\S+): complete documentation/m.exec(snapshot)?.[1]).toBe(release);
  const reference = snapshot.slice(snapshot.indexOf('\n# API reference'));
  const corpus = buildCorpus(parseLlmsFull);
  const stale = corpus.api
    .filter(
      (e) => e.specifier === '@gyral/core' && (e.kind === 'function' || e.kind === 'constant'),
    )
    .filter((e) => e.doc !== '')
    .filter((e) => {
      const start = reference.indexOf(`\n#### \`${e.name}\`\n`);
      if (start === -1) return true;
      const end = reference.indexOf('\n#', start + 1);
      return !words(reference.slice(start, end)).includes(firstParagraph(e.doc));
    })
    .map((e) => e.name);
  expect(stale, 'refresh it from a gyral.dev build of this release (releasing.md step 2)').toEqual(
    [],
  );
});

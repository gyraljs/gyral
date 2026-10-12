// Manual release-gated Context7 submission and retrieval; never runs on push or in CI.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  context7Request,
  inspectContext,
  libraryId,
  preflight,
  QUERIES,
  SOURCE,
} from './lib/context7.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, library: { type: 'string' } },
});
const mode = positionals[0];
if (positionals.length !== 1 || !['preflight', 'submit', 'verify'].includes(mode)) {
  throw new Error(
    'Usage: node scripts/context7.mjs preflight|submit|verify [--library /source/id] [--out new-directory]',
  );
}
const evidence = values.out ?? mkdtempSync(join(tmpdir(), 'gyral-context7-'));
if (values.out) mkdirSync(evidence); // Refuse to overwrite earlier evidence.
const save = (file, data) =>
  writeFileSync(join(evidence, file), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Evidence: ${evidence}`);

try {
  const release = await preflight();
  save('preflight.json', release);
  console.log(
    `Preflight passed: all nine npm latest=${release.version}; public docs match published MCP.`,
  );
  if (mode !== 'preflight') {
    const key = process.env.CONTEXT7_API_KEY;
    if (!key)
      throw new Error(
        'Set CONTEXT7_API_KEY through your local secret environment to submit or verify.',
      );
    if (mode === 'submit') {
      const result = await context7Request('/api/v2/add/llmstxt', key, {
        method: 'POST',
        body: JSON.stringify({ llmstxtUrl: SOURCE }),
      });
      const id = libraryId(result.libraryName);
      save('submission.json', {
        ...result,
        libraryId: id,
        url: `https://context7.com${id}`,
        submittedAt: new Date().toISOString(),
      });
      console.log(
        `Submitted: https://context7.com${id}. Indexing and retrieval verification remain.`,
      );
    } else {
      const id = libraryId(values.library);
      const listing = await fetch(`https://context7.com${id}`, {
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });
      if (listing.status !== 200)
        throw new Error(`Library page HTTP ${listing.status}; listing not verified.`);
      const results = [];
      for (const query of QUERIES) {
        const params = new URLSearchParams({
          libraryId: id,
          query: query.query,
          type: 'json',
          language: 'TypeScript',
        });
        const data = await context7Request(`/api/v2/context?${params}`, key);
        save(`${query.name}.json`, data); // Save even if the smoke check fails.
        results.push(inspectContext(data, query));
      }
      save('retrieval.json', {
        libraryId: id,
        url: `https://context7.com${id}`,
        ...release,
        results,
        reviewRequired: true,
      });
      console.log(
        `All three retrieval smoke checks passed. Review saved snippets against ${release.version} before closing the bead.`,
      );
    }
  }
} catch (error) {
  save('failure.json', {
    failedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : 'Unknown failure',
  });
  console.error(error instanceof Error ? error.message : 'Unknown failure');
  process.exitCode = 1;
}

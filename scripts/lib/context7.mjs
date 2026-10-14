import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import './load-ts.mjs';
import { parseLlmsFull } from '../../packages/mcp/src/docs.ts';

export const SOURCE = 'https://gyral.dev/llms-full.txt';
export const PACKAGES = ['core', 'devtools', 'http', 'mcp', 'router', 'ssr', 'testing', 'time']
  .map((name) => `@gyral/${name}`)
  .concat('create-gyral');

export const QUERIES = [
  {
    name: 'components',
    query:
      'Gyral define() component with typed intents, pure update and html view using data-intent',
    symbols: ['define', 'data-intent'],
  },
  {
    name: 'forms',
    query: 'Gyral validated form with form(), Standard Schema, IntentRejected and field errors',
    symbols: ['form', 'IntentRejected'],
  },
  {
    name: 'drivers',
    query:
      'Gyral localStorageDriver and indexedDBDriver imports, typed commands and decoded results',
    symbols: ['localStorageDriver', 'indexedDBDriver'],
  },
];

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The docs with release labels blanked: links into gyraljs/gyral at a release tag, and the
 * errors page's "read from `@gyral/core` X.Y.Z" line. The MCP snapshot is taken from a gyral.dev
 * release build while the site still installs the previous release, so those name the previous
 * tag; the site's npm move then relabels them (gyral releasing.md, step 7). Nothing else may
 * differ between the published corpus and the live site.
 */
export const withoutReleaseLabels = (text) =>
  text
    .replace(/(github\.com\/gyraljs\/gyral\/(?:blob|tree)\/)v\d+\.\d+\.\d+\//g, '$1vX.Y.Z/')
    .replace(
      /(read from `@gyral\/core` )\d+\.\d+\.\d+(, the version this site is built with)/g,
      '$1X.Y.Z$2',
    );

async function get(url, fetchFn) {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Preflight HTTP ${response.status}: ${url}`);
  return response;
}

/** Check actual registry availability and the published MCP corpus, not just repo versions. */
export async function preflight(fetchFn = fetch) {
  const snapshot = readFileSync(
    new URL('../../packages/mcp/data/llms-full.txt', import.meta.url),
    'utf8',
  );
  const version = /^# Gyral (\d+\.\d+\.\d+): complete documentation\n/.exec(snapshot)?.[1];
  if (!version) throw new Error('The docs snapshot must identify a final stable version.');
  const packages = await Promise.all(
    PACKAGES.map(async (name) => {
      const metadata = await (
        await get(`https://registry.npmjs.org/${encodeURIComponent(name)}`, fetchFn)
      ).json();
      const published = metadata.versions?.[version];
      if (
        !published ||
        metadata['dist-tags']?.latest !== version ||
        !published.dist?.attestations?.provenance
      ) {
        throw new Error(`${name}: final ${version} must be published as latest with provenance.`);
      }
      return { name, version, dist: published.dist };
    }),
  );
  const live = await (await get(SOURCE, fetchFn)).text();
  if (withoutReleaseLabels(live) !== withoutReleaseLabels(snapshot))
    throw new Error('Public llms-full.txt differs from the released docs snapshot.');
  const mcp = packages.find((pkg) => pkg.name === '@gyral/mcp');
  if (!mcp || !mcp.dist.tarball.startsWith('https://registry.npmjs.org/'))
    throw new Error('MCP tarball must come from npm.');
  const bytes = Buffer.from(await (await get(mcp.dist.tarball, fetchFn)).arrayBuffer());
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== mcp.dist.integrity) {
    throw new Error('Published MCP tarball integrity mismatch.');
  }
  const corpus = JSON.parse(
    execFileSync('tar', ['-xzOf', '-', 'package/dist/corpus.json'], {
      input: bytes,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    }).toString(),
  );
  if (
    corpus.version !== version ||
    JSON.stringify(corpus.docs) !== JSON.stringify(parseLlmsFull(snapshot))
  ) {
    throw new Error('Public documentation differs from the published MCP corpus.');
  }
  return {
    checkedAt: new Date().toISOString(),
    version,
    source: SOURCE,
    sourceSha256: digest(live),
    snapshotSha256: digest(snapshot),
    packages,
  };
}

export function libraryId(value) {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value)) {
    throw new Error(
      'Use the exact unversioned library ID returned by Context7, e.g. /llmstxt/example.',
    );
  }
  return value;
}

/** A smoke check only; API compatibility and completeness still require snippet review. */
export function inspectContext(data, query) {
  const snippets = Array.isArray(data.codeSnippets) ? data.codeSnippets : [];
  if (snippets.length === 0) throw new Error(`${query.name}: no code snippets returned.`);
  const code = snippets
    .flatMap((snippet) => snippet.codeList ?? [])
    .map((entry) => entry.code ?? '')
    .join('\n');
  for (const symbol of query.symbols) {
    if (!code.includes(symbol))
      throw new Error(`${query.name}: missing ${symbol} in returned code.`);
  }
  const sources = snippets.map((snippet) => snippet.codeId ?? '');
  if (!sources.every((source) => /^https:\/\/gyral\.dev\//.test(source))) {
    throw new Error(`${query.name}: returned code must cite official gyral.dev documentation.`);
  }
  return { name: query.name, snippets: snippets.length, sources, reviewRequired: true };
}

export async function context7Request(path, key, options = {}, fetchFn = fetch) {
  const response = await fetchFn(`https://context7.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  // Do not print response bodies or headers on auth/errors; never echo a credential.
  if (response.status !== 200)
    throw new Error(
      `Context7 HTTP ${response.status}; inspect account or indexing status. No automatic retry.`,
    );
  const result = await response.json();
  if (result.error) throw new Error('Context7 returned an error instead of documentation.');
  return result;
}

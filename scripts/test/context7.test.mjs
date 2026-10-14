import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import '../lib/load-ts.mjs';
import { parseLlmsFull } from '../../packages/mcp/src/docs.ts';
import {
  context7Request,
  inspectContext,
  libraryId,
  PACKAGES,
  preflight,
  QUERIES,
  SOURCE,
} from '../lib/context7.mjs';

const dir = mkdtempSync(join(tmpdir(), 'gyral-context7-test-'));
const snapshot = readFileSync(
  new URL('../../packages/mcp/data/llms-full.txt', import.meta.url),
  'utf8',
);
const version = /^# Gyral (\d+\.\d+\.\d+):/.exec(snapshot)?.[1];
mkdirSync(join(dir, 'package/dist'), { recursive: true });
writeFileSync(
  join(dir, 'package/dist/corpus.json'),
  JSON.stringify({ version, docs: parseLlmsFull(snapshot) }),
);
const tarball = execFileSync('tar', ['-czf', '-', '-C', dir, 'package/dist/corpus.json']);
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function registry({ latest = version, live = snapshot, bytes = tarball } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      if (url === SOURCE) return new Response(live);
      if (url === 'https://registry.npmjs.org/mcp.tgz') return new Response(bytes);
      return Response.json({
        'dist-tags': { latest },
        versions: {
          [version]: {
            dist: {
              tarball: 'https://registry.npmjs.org/mcp.tgz',
              integrity,
              attestations: { provenance: {} },
            },
          },
        },
      });
    },
  };
}

describe('release-gated Context7 preflight', () => {
  it('checks every registry package and the actual published corpus without external writes', async () => {
    const fake = registry();
    const result = await preflight(fake.fetch);
    expect(result.version).toBe(version);
    expect(result.packages.map((pkg) => pkg.name)).toEqual(PACKAGES);
    expect(fake.calls).toHaveLength(11);
  });

  it('refuses staging, prereleases or a stale latest tag', async () => {
    const fake = registry({ latest: `${version}-next.1` });
    await expect(preflight(fake.fetch)).rejects.toThrow('must be published as latest');
    expect(fake.calls).not.toContain(SOURCE);
  });

  it('refuses website docs that differ from the release', async () => {
    await expect(
      preflight(registry({ live: `${snapshot}\nNew unpublished API` }).fetch),
    ).rejects.toThrow('differs from');
  });

  it('accepts the npm move relabelling release links, and nothing more', async () => {
    // The snapshot is taken before the release, so its links name the previous tag.
    const tag = /\/gyraljs\/gyral\/blob\/v\d+\.\d+\.\d+\//.exec(snapshot)?.[0] ?? '';
    expect(tag).not.toBe('');
    const moved = snapshot.replaceAll(tag, '/gyraljs/gyral/blob/v9.9.9/');
    expect((await preflight(registry({ live: moved }).fetch)).version).toBe(version);
    await expect(
      preflight(registry({ live: moved.replace('/blob/v9.9.9/', '/blob/main/') }).fetch),
    ).rejects.toThrow('differs from');
  });

  it('refuses corrupted published tarballs', async () => {
    await expect(preflight(registry({ bytes: Buffer.from('corrupted') }).fetch)).rejects.toThrow(
      'integrity mismatch',
    );
  });
});

describe('exact Context7 retrieval and auth handling', () => {
  const data = {
    codeSnippets: [
      {
        codeId: 'https://gyral.dev/docs/components/#example',
        codeList: [{ code: 'define(); data-intent' }],
      },
    ],
  };

  it('requires the returned ID and rejects URLs or query injection', () => {
    expect(libraryId('/llmstxt/gyral_dev')).toBe('/llmstxt/gyral_dev');
    for (const bad of [undefined, 'gyral', 'https://context7.com/a/b', '/a/b?query=other']) {
      expect(() => libraryId(bad)).toThrow('exact unversioned library ID');
    }
  });

  it('rejects empty, irrelevant and unofficial snippets; passing smoke checks still need review', () => {
    expect(inspectContext(data, QUERIES[0]).reviewRequired).toBe(true);
    expect(() => inspectContext({ codeSnippets: [] }, QUERIES[0])).toThrow('no code');
    expect(() => inspectContext(data, QUERIES[2])).toThrow('missing localStorageDriver');
    expect(() =>
      inspectContext(
        { codeSnippets: [{ ...data.codeSnippets[0], codeId: 'https://unofficial.example/docs' }] },
        QUERIES[0],
      ),
    ).toThrow('official');
  });

  it('does not follow redirects, retry writes or expose auth error bodies', async () => {
    let calls = 0;
    const fake = async (_url, options) => {
      calls++;
      expect(options.redirect).toBe('error');
      expect(options.headers.Authorization).toBe('Bearer private-test-key');
      return Response.json({ error: 'private-test-key' }, { status: 401 });
    };
    await expect(
      context7Request('/api/v2/add/llmstxt', 'private-test-key', { method: 'POST' }, fake),
    ).rejects.toThrow('HTTP 401');
    expect(calls).toBe(1);
  });
});

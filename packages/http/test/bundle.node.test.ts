// What a fetch-only app bundles (ADR 0022): reaching CSRF handling and retries takes a call
// (`csrfFromMeta`, `retry`), so an app that only calls `get()` contains neither.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, type Rolldown } from 'vite';
import { expect, it } from 'vitest';

const HTTP = resolve(import.meta.dirname, '../src/index.ts');
const CORE = resolve(import.meta.dirname, '../../core/src/index.ts');

async function bundle(source: string): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'gyral-http-bundle-'));
  writeFileSync(join(root, 'main.ts'), source);
  // Vite picks the `production` condition from NODE_ENV (Vitest sets it to `test`).
  const nodeEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  try {
    const output = (await build({
      root,
      configFile: false,
      logLevel: 'silent',
      mode: 'production',
      build: {
        write: false,
        rollupOptions: { input: join(root, 'main.ts'), preserveEntrySignatures: 'strict' },
      },
    })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
    const outputs = Array.isArray(output) ? output : [output];
    return outputs
      .flatMap((o) => o.output)
      .map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
      .join('\n');
  } finally {
    process.env['NODE_ENV'] = nodeEnv;
    rmSync(root, { recursive: true, force: true });
  }
}

it('a fetch-only app bundles no CSRF lookup and no retry delays', async () => {
  const code = await bundle(`
    import { get } from ${JSON.stringify(HTTP)};
    export const load = get('/items', { onSuccess: (body) => body });
  `);
  expect(code).toContain('application/json'); // the driver is there
  expect(code).not.toContain('meta[name=');
  expect(code).not.toContain('exponential');
}, 60_000);

it('csrfFromMeta and retry are bundled once the app calls them', async () => {
  const code = await bundle(`
    import { retry } from ${JSON.stringify(CORE)};
    import { csrfFromMeta, makeHttpDriver } from ${JSON.stringify(HTTP)};
    export const api = retry(makeHttpDriver({ headers: csrfFromMeta('csrf-token') }), {
      times: 2,
      backoff: 'exponential',
    });
  `);
  expect(code).toContain('meta[name=');
  expect(code).toContain('exponential');
}, 60_000);

// `pnpm mcp:refresh`: updates the committed docs snapshot from the live site. Run it before a
// release (after the site has published the docs for that release), review the diff, commit.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.GYRAL_DOCS_ORIGIN ?? 'https://gyral.dev';
for (const file of ['llms.txt', 'llms-full.txt']) {
  const response = await fetch(`${base}/${file}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${base}/${file} answered ${String(response.status)}`);
  const text = await response.text();
  writeFileSync(join(import.meta.dirname, '..', 'data', file), text);
  console.log(`data/${file}: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KiB from ${base}`);
}

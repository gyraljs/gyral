// Measures production bundle sizes of every example (gyral-ob0, ADR 0015).
//   pnpm size                 → table for all examples
//   pnpm size counter bmi     → only those
//   pnpm size --json          → machine-readable output
// Each example is built twice with Vite in production mode: once as shipped, once with
// `effect` externalized. Since 0.2.0 Gyral has no Effect dependency (ADR 0015), so the
// "effect" column reads 0 unless an app imports Effect itself.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'vite';

const args = process.argv.slice(2);
const json = args.includes('--json');
const wanted = args.filter((a) => !a.startsWith('--'));

/** The browser entry of an example: its index.html, or a client entry for SSR examples. */
function entryOf(dir) {
  if (existsSync(join(dir, 'index.html'))) return join(dir, 'index.html');
  const client = join(dir, 'src', 'entry-client.ts');
  return existsSync(client) ? client : undefined;
}

async function bundleBytes(root, entry, externalEffect) {
  const output = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    build: {
      write: false,
      minify: true,
      modulePreload: false,
      rollupOptions: {
        input: entry,
        ...(externalEffect ? { external: [/^effect(\/|$)/] } : {}),
      },
    },
  });
  const outputs = Array.isArray(output) ? output : [output];
  const code = outputs
    .flatMap((o) => o.output)
    .filter((chunk) => chunk.type === 'chunk')
    .map((chunk) => chunk.code)
    .join('\n');
  const raw = Buffer.from(code);
  return {
    min: raw.length,
    gzip: gzipSync(raw, { level: 9 }).length,
    brotli: brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && (wanted.length === 0 || wanted.includes(e.name)))
  .map((e) => ({ name: e.name, root: resolve('examples', e.name) }))
  .map((e) => ({ ...e, entry: entryOf(e.root) }))
  .filter((e) => e.entry !== undefined);

const rows = [];
for (const ex of examples) {
  const full = await bundleBytes(ex.root, ex.entry, false);
  const without = await bundleBytes(ex.root, ex.entry, true);
  rows.push({
    example: ex.name,
    minKb: full.min / 1024,
    gzipKb: full.gzip / 1024,
    brotliKb: full.brotli / 1024,
    effectGzipKb: (full.gzip - without.gzip) / 1024,
  });
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const kb = (n) => n.toFixed(1).padStart(8);
  console.log(
    `${'example'.padEnd(22)}${'min'.padStart(8)}${'gzip'.padStart(8)}${'brotli'.padStart(8)}${'effect(gz)'.padStart(12)}`,
  );
  for (const r of rows) {
    console.log(
      `${r.example.padEnd(22)}${kb(r.minKb)}${kb(r.gzipKb)}${kb(r.brotliKb)}${kb(r.effectGzipKb).padStart(12)}`,
    );
  }
  console.log('Sizes in KiB. effect(gz): gzip bytes that disappear when `effect` is externalized.');
}

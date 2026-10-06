// Measures production bundle sizes of every example (gyral-ob0, ADR 0015) and of the view
// layer's client API, and enforces the size budget (gyral-g1r.2, ADR 0018).
//   pnpm size                 → table for all examples and the view layer
//   pnpm size counter view    → only those
//   pnpm size --json          → machine-readable output
//   pnpm size --check         → fail when a bundle exceeds scripts/size-budget.json
// Each example is built once with Vite in production mode, all chunks concatenated. The "view"
// row builds scripts/size/view-entry.js (render, html, compiled, each, raw, nothing,
// defineHook) with the `gyral-compiled` condition, as the Vite preset does, so the runtime
// template preparer is left out; its budget is the top-level "view" key.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'vite';

const args = process.argv.slice(2);
const json = args.includes('--json');
const check = args.includes('--check');
const wanted = args.filter((a) => !a.startsWith('--'));
const BUDGET_FILE = 'scripts/size-budget.json';
/** A bundle this far under its budget should get a lower budget (the ratchet). */
const SLACK_KIB = 0.5;

/** The browser entry of an example: its index.html, or a client entry for SSR examples. */
function entryOf(dir) {
  if (existsSync(join(dir, 'index.html'))) return join(dir, 'index.html');
  const client = join(dir, 'src', 'entry-client.ts');
  return existsSync(client) ? client : undefined;
}

async function bundleBytes(root, entry, conditions) {
  const output = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    mode: 'production',
    ...(conditions === undefined ? {} : { resolve: { conditions } }),
    build: { write: false, minify: true, modulePreload: false, rollupOptions: { input: entry } },
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
    brotli: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && (wanted.length === 0 || wanted.includes(e.name)))
  .map((e) => ({ name: e.name, root: resolve('examples', e.name) }))
  .map((e) => ({ ...e, entry: entryOf(e.root) }))
  .filter((e) => e.entry !== undefined);

const budgetFile = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
const budgets = { ...budgetFile.budgets, view: budgetFile.view };
const VIEW_CONDITIONS = ['gyral-compiled', 'module', 'browser', 'production'];
const targets = [...examples];
if (wanted.length === 0 || wanted.includes('view')) {
  const root = resolve('.');
  targets.push({ name: 'view', root, entry: resolve('scripts/size/view-entry.js') });
}
const rows = [];
for (const t of targets) {
  const size = await bundleBytes(t.root, t.entry, t.name === 'view' ? VIEW_CONDITIONS : undefined);
  rows.push({
    example: t.name,
    minKb: size.min / 1024,
    gzipKb: size.gzip / 1024,
    brotliKb: size.brotli / 1024,
    budgetKb: budgets[t.name],
  });
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const kb = (n) => (n === undefined ? '-' : n.toFixed(1)).padStart(8);
  console.log(
    `${'example'.padEnd(22)}${'min'.padStart(8)}${'gzip'.padStart(8)}${'brotli'.padStart(8)}${'budget'.padStart(8)}`,
  );
  for (const r of rows) {
    console.log(
      `${r.example.padEnd(22)}${kb(r.minKb)}${kb(r.gzipKb)}${kb(r.brotliKb)}${kb(r.budgetKb)}`,
    );
  }
  console.log('Sizes in KiB. budget: max gzip KiB from scripts/size-budget.json.');
}

if (check) {
  const errors = [];
  const hints = [];
  for (const r of rows) {
    if (r.budgetKb === undefined) {
      const where = r.example === 'view' ? 'as the top-level "view" key of' : 'to the budgets in';
      errors.push(
        `${r.example}: no budget. Add "${r.example}": ${(Math.ceil(r.gzipKb * 10) / 10 + 0.1).toFixed(1)} ${where} ${BUDGET_FILE}.`,
      );
    } else if (r.gzipKb > r.budgetKb) {
      errors.push(
        `${r.example}: ${r.gzipKb.toFixed(2)} KiB gzip is over its ${r.budgetKb} KiB budget. ` +
          `Find what grew (pnpm size ${r.example}; vite build --mode production in the example) ` +
          `and shrink it. Raise a budget only with an ADR-backed reason (ADR 0018).`,
      );
    } else if (r.budgetKb - r.gzipKb > SLACK_KIB) {
      hints.push(
        `${r.example}: ${r.gzipKb.toFixed(2)} KiB, budget ${r.budgetKb}. Lower the budget to lock in the win.`,
      );
    }
  }
  for (const h of hints) console.log(`size: hint: ${h}`);
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`size: ${rows.length} bundles within budget`);
}

// Measures production bundle sizes of every example (gyral-ob0, ADR 0015) and enforces the size
// budget (gyral-g1r.2, ADR 0018).
//   pnpm size                 → table for all examples
//   pnpm size counter bmi     → only those
//   pnpm size --json          → machine-readable output
//   pnpm size --check         → fail when an example exceeds scripts/size-budget.json
// Each example is built once with Vite in production mode and the Gyral preset (its template
// compiler and the gyral-compiled condition, view/01-templates.md), all chunks concatenated:
// budgets measure what apps built with the preset ship.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build, runnerImport } from 'vite';

// The preset is TypeScript: load it the way Vite loads a vite.config.ts. Loading sets
// NODE_ENV=development when unset, which would give every build Lit's development code.
const nodeEnv = process.env.NODE_ENV;
const { module: presetModule } = await runnerImport(resolve('packages/core/src/vite.ts'));
if (nodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = nodeEnv;

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

async function bundleBytes(root, entry) {
  const preset = presetModule.gyralVitePreset();
  const output = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: preset.plugins,
    resolve: preset.resolve,
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

const budgets = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).budgets;
const rows = [];
for (const ex of examples) {
  const size = await bundleBytes(ex.root, ex.entry);
  rows.push({
    example: ex.name,
    minKb: size.min / 1024,
    gzipKb: size.gzip / 1024,
    brotliKb: size.brotli / 1024,
    budgetKb: budgets[ex.name],
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
      errors.push(
        `${r.example}: no budget. Add "${r.example}": ${(Math.ceil(r.gzipKb * 10) / 10 + 0.1).toFixed(1)} to ${BUDGET_FILE}.`,
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
  console.log(`size: ${rows.length} examples within budget`);
}

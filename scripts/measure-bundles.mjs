// Measures production bundle sizes of every example (gyral-ob0, ADR 0015) and of the view
// layer's client API, and enforces the size budget (gyral-g1r.2, ADR 0018).
//   pnpm size                 → table for all examples and the view layer
//   pnpm size counter view    → only those
//   pnpm size --json          → machine-readable output
//   pnpm size --check         → fail when a bundle exceeds scripts/size-budget.json (all chunks
//                               under "budgets", the initial chunk under "initial")
// Each example is built once with Vite in production mode and the Gyral preset (its template
// compiler and the gyral-compiled condition, view/01-templates.md), all chunks concatenated:
// budgets measure what apps built with the preset ship. The `initial` column is what a page
// downloads before any import() runs: the entry chunk and its static imports. Lazily loaded
// chunks (hydration for server-rendered pages, tier-3 fallbacks, route chunks) count only in
// `gzip`; a client-only app never fetches the hydration chunk (view/07-hydration.md). The "view" row builds
// scripts/size/view-entry.js (render, html, compiled, each, raw, nothing, defineHook) with the
// `gyral-compiled` condition, so the runtime template preparer is left out; its budget is the
// top-level "view" key.
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

async function bundleBytes(root, entry, conditions) {
  const preset = presetModule.gyralVitePreset();
  const output = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    mode: 'production',
    plugins: preset.plugins,
    resolve: conditions === undefined ? preset.resolve : { ...preset.resolve, conditions },
    build: { write: false, minify: true, modulePreload: false, rollupOptions: { input: entry } },
  });
  const outputs = Array.isArray(output) ? output : [output];
  const chunks = outputs.flatMap((o) => o.output).filter((chunk) => chunk.type === 'chunk');
  const raw = Buffer.from(chunks.map((chunk) => chunk.code).join('\n'));
  return {
    min: raw.length,
    gzip: gzipSync(raw, { level: 9 }).length,
    brotli: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    initial: gzipSync(Buffer.from(initialCode(chunks)), { level: 9 }).length,
  };
}

/** The entry chunks and everything they import statically, in output order. */
function initialCode(chunks) {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const wanted = new Set();
  const visit = (chunk) => {
    if (chunk === undefined || wanted.has(chunk)) return;
    wanted.add(chunk);
    for (const name of chunk.imports) visit(byName.get(name));
  };
  for (const chunk of chunks) if (chunk.isEntry) visit(chunk);
  return chunks
    .filter((chunk) => wanted.has(chunk))
    .map((chunk) => chunk.code)
    .join('\n');
}

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && (wanted.length === 0 || wanted.includes(e.name)))
  .map((e) => ({ name: e.name, root: resolve('examples', e.name) }))
  .map((e) => ({ ...e, entry: entryOf(e.root) }))
  .filter((e) => e.entry !== undefined);

const budgetFile = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
const budgets = { ...budgetFile.budgets, view: budgetFile.view };
const initialBudgets = budgetFile.initial;
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
    initialKb: size.initial / 1024,
    budgetKb: budgets[t.name],
    initialBudgetKb: t.name === 'view' ? undefined : initialBudgets[t.name],
  });
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const kb = (n) => (n === undefined ? '-' : n.toFixed(1)).padStart(8);
  console.log(
    `${'example'.padEnd(22)}${'min'.padStart(8)}${'gzip'.padStart(8)}${'brotli'.padStart(8)}${'initial'.padStart(8)}${'budget'.padStart(8)}`,
  );
  for (const r of rows) {
    console.log(
      `${r.example.padEnd(22)}${kb(r.minKb)}${kb(r.gzipKb)}${kb(r.brotliKb)}${kb(r.initialKb)}${kb(r.budgetKb)}`,
    );
  }
  console.log(
    'Sizes in KiB. gzip/brotli: all chunks; initial: gzip of the entry and its static imports ' +
      '(no lazy chunks). budget: max gzip KiB (all chunks) from scripts/size-budget.json, which ' +
      'also caps `initial`.',
  );
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
  for (const r of rows) {
    if (r.example === 'view') continue;
    if (r.initialBudgetKb === undefined) {
      errors.push(
        `${r.example}: no initial-chunk budget. Add "${r.example}": ${(Math.ceil(r.initialKb * 10) / 10 + 0.1).toFixed(1)} to "initial" in ${BUDGET_FILE}.`,
      );
    } else if (r.initialKb > r.initialBudgetKb) {
      errors.push(
        `${r.example}: its initial chunk, ${r.initialKb.toFixed(2)} KiB gzip, is over its ` +
          `${r.initialBudgetKb} KiB budget. Find what grew in the entry chunk (pnpm size ` +
          `${r.example}), or load it lazily. Raise a budget only with an ADR-backed reason.`,
      );
    } else if (r.initialBudgetKb - r.initialKb > SLACK_KIB) {
      hints.push(
        `${r.example}: initial ${r.initialKb.toFixed(2)} KiB, budget ${r.initialBudgetKb}. Lower it to lock in the win.`,
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

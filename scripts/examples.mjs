// Runs every example (or the ones named) side by side, plus an index page linking them.
//   pnpm examples                 → all examples, index at http://localhost:5100
//   pnpm examples counter bmi     → just those
//   EXAMPLES_PORT=5400 pnpm examples → index at :5400, examples from :5401 (a second checkout
//                                      or agent worktree can run alongside the first)
// Plain examples run `vite`; SSR examples (with server/dev.ts) run their own dev server.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const INDEX_PORT = Number(process.env['EXAMPLES_PORT'] ?? 5100);
const FIRST_PORT = INDEX_PORT + 1;
// HMR WebSockets for SSR examples, kept clear of the HTTP ports.
const FIRST_HMR_PORT = 24700 + (INDEX_PORT - 5100);
const wanted = process.argv.slice(2);

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join('examples', e.name, 'package.json')))
  .filter((e) => wanted.length === 0 || wanted.includes(e.name))
  .map((e, n) => {
    const dir = join('examples', e.name);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const ssr = existsSync(join(dir, 'server', 'dev.ts'));
    return {
      name: e.name,
      dir,
      ssr,
      port: FIRST_PORT + n,
      hmr: FIRST_HMR_PORT + n,
      about: pkg.description ?? '',
    };
  });

if (examples.length === 0) {
  console.error(`No examples match: ${wanted.join(', ')}`);
  process.exit(1);
}

const children = examples.map((ex) => {
  const args = ex.ssr
    ? ['exec', 'tsx', 'server/dev.ts']
    : ['exec', 'vite', '--port', String(ex.port), '--strictPort'];
  const child = spawn('pnpm', args, {
    cwd: ex.dir,
    env: { ...process.env, PORT: String(ex.port), HMR_PORT: String(ex.hmr) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[${ex.name}] ${String(chunk)}`));
  return child;
});

const escape = (s) => s.replace(/[&<>"]/g, (c) => `&#${String(c.charCodeAt(0))};`);
const rows = examples
  .map(
    (ex) =>
      `<li><a href="http://localhost:${String(ex.port)}/">${escape(ex.name)}</a>` +
      `${ex.ssr ? ' <small>(server-rendered)</small>' : ''}<p>${escape(ex.about)}</p></li>`,
  )
  .join('\n');
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gyral examples</title><meta name="color-scheme" content="light dark">
<style>
  body { font-family: system-ui, sans-serif; max-inline-size: 48rem; margin-inline: auto; padding: 2rem 1rem; }
  ul { list-style: none; padding: 0; display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); }
  li { border: 1px solid color-mix(in oklch, currentColor 25%, transparent); border-radius: 0.5rem; padding: 0.75rem 1rem; }
  a { font-weight: 600; } p { margin-block: 0.25rem 0; font-size: 0.9rem; opacity: 0.8; }
</style></head>
<body><main><h1>Gyral examples</h1><p>Ports of the Cycle.js examples. Each runs its own dev server.</p>
<ul>
${rows}
</ul></main></body></html>`;

const index = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(INDEX_PORT, () => {
  console.log(`Gyral examples: http://localhost:${String(INDEX_PORT)}  (Ctrl+C to stop)`);
  for (const ex of examples)
    console.log(`  ${ex.name.padEnd(22)} http://localhost:${String(ex.port)}/`);
});

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  index.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

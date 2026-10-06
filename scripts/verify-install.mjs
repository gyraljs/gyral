// pnpm verify:install — the consumer's view of a release. Packs every package, installs the
// tarballs with npm into a fresh temp project (peers from the registry, so it needs network),
// then imports every published entry point from Node and server-renders a tiny page.
// Run before a first publish and after packaging changes; it is too slow for `pnpm check`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PEERS = [
  'lit@^3.3.0',
  '@lit-labs/ssr@^4.1.0',
  '@lit-labs/ssr-client@^1.1.8',
  'fast-check@^4',
];

const dir = mkdtempSync(join(tmpdir(), 'gyral-install-'));
const tarballs = join(dir, 'tarballs');
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] });

try {
  for (const pkg of readdirSync('packages')) {
    sh('pnpm', ['pack', '--pack-destination', tarballs], join('packages', pkg));
  }
  const app = join(dir, 'app');
  sh('mkdir', ['-p', app]);
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'app', private: true, type: 'module' }),
  );
  const tgz = readdirSync(tarballs).map((f) => join(tarballs, f));
  sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...tgz, ...PEERS], app);

  writeFileSync(
    join(app, 'smoke.mjs'),
    `
// @gyral/ssr installs Lit's server DOM shim, so it loads first (as on a real server).
import { renderToString } from '@gyral/ssr';
import { html } from 'lit';
const entries = [
  '@gyral/core', '@gyral/core/vite', '@gyral/core/eslint', '@gyral/http', '@gyral/http/testing',
  '@gyral/router', '@gyral/time', '@gyral/ssr/static', '@gyral/testing',
  '@gyral/testing/arbitraries',
];
for (const entry of entries) {
  const mod = await import(entry);
  if (Object.keys(mod).length === 0) throw new Error(entry + ' has no exports');
  console.log('import ok  ' + entry + ' (' + Object.keys(mod).length + ' exports)');
}
const { define } = await import('@gyral/core');
define('gy-hello', {
  init: () => ({ name: 'world' }),
  intent: {},
  update: {},
  view: (s) => html\`<p>Hello, \${s.name}!</p>\`,
});
const out = await renderToString(html\`<gy-hello></gy-hello>\`);
if (!out.includes('shadowrootmode="open"') || !out.replace(/<!--.*?-->/g, '').includes('Hello, world!')) {
  throw new Error('unexpected SSR output: ' + out);
}
console.log('ssr ok     <gy-hello> rendered to Declarative Shadow DOM (' + out.length + ' chars)');
`,
  );
  execFileSync('node', ['smoke.mjs'], { cwd: app, stdio: 'inherit' });

  // @gyral/mcp: start the installed bin over stdio and call it the way an agent would.
  writeFileSync(
    join(app, 'mcp.mjs'),
    `
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'verify-install', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node_modules/.bin/gyral-mcp', stderr: 'ignore' }));
const { tools } = await client.listTools();
const result = await client.callTool({ name: 'get_api', arguments: { symbol: 'define' } });
const text = result.content.map((c) => c.text).join('');
if (tools.length !== 7 || !text.includes("import { define } from '@gyral/core'")) {
  throw new Error('unexpected MCP answer: ' + tools.length + ' tools, ' + text.slice(0, 200));
}
await client.close();
console.log('mcp ok     gyral-mcp answered over stdio (' + tools.length + ' tools)');
`,
  );
  execFileSync('node', ['mcp.mjs'], { cwd: app, stdio: 'inherit' });
  console.log(`verify:install ok (${tgz.length} tarballs, peers: ${PEERS.join(' ')})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// Network acceptance fixture for exact released npm packages; no workspace substitutions.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'gyral-registry-production-'));
try {
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      sideEffects: true,
      dependencies: { '@gyral/core': '0.3.8', '@gyral/ssr': '0.3.8', vite: '8.3.3' },
    }),
  );
  await execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: root,
    timeout: 120_000,
  });
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  for (const name of ['core', 'ssr']) {
    const entry = lock.packages[`node_modules/@gyral/${name}`];
    assert.equal(entry.version, '0.3.8');
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
    assert.match(entry.integrity, /^sha512-/);
  }
  await mkdir(join(root, 'src'));
  await writeFile(
    join(root, 'src/card.ts'),
    `import { define, html } from '@gyral/core';
    define()('registry-card', { init: () => ({}), view: () => html\`<p>Registry SSR</p>\` });`,
  );
  await writeFile(join(root, 'src/client.ts'), `import './card.ts';`);
  await writeFile(
    join(root, 'prepare.mjs'),
    `
    import { build } from 'vite';
    import { gyralVitePreset } from '@gyral/core/vite';
    import { componentsFromManifest } from '@gyral/ssr/static';
    import { writeFile } from 'node:fs/promises';
    await build({ configFile: false, logLevel: 'silent', ...gyralVitePreset({ components: true }),
      build: { outDir: 'client', rolldownOptions: { input: 'src/client.ts' } } });
    const assets = await componentsFromManifest('client');
    await writeFile('src/metadata.ts', 'export const components = ' + JSON.stringify({ ...assets, modules: [...assets.modules] })
      + '; components.modules = new Map(components.modules);');
    await build({ configFile: false, logLevel: 'silent', ...gyralVitePreset(), ssr: { noExternal: ['@gyral/core', '@gyral/ssr'] },
      build: { ssr: 'src/server.ts', outDir: 'server', minify: true,
        rolldownOptions: { output: { codeSplitting: false, format: 'es', entryFileNames: 'server.mjs' } } } });`,
  );
  await writeFile(
    join(root, 'src/server.ts'),
    `
    import './card.ts';
    import { createServer } from 'node:http';
    import { html } from '@gyral/core';
    import { renderPage } from '@gyral/ssr';
    import { toNodeListener } from '@gyral/ssr/node';
    import { components } from './metadata.ts';
    export const state = { peer: undefined, origin: undefined, aborted: false, count: 0 };
    export const server = createServer(toNodeListener(async (request, env) => {
      state.count++; state.peer = env.remoteAddress; state.origin = new URL(request.url).origin;
      if (new URL(request.url).pathname === '/cancel') return new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('start')); },
        cancel() { state.aborted = true; }
      }));
      return renderPage({ title: 'Registry', body: html\`<registry-card></registry-card>\`, components, dev: false });
    }, { origin: 'https://app.example' }));
    server.on('upgrade', (request, socket) => {
      if (request.url !== '/ws' || request.headers.origin !== 'https://app.example') {
        socket.end('HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n'); return;
      }
      socket.end('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\n\\r\\n');
    });
    export { components };`,
  );
  await execute(process.execPath, ['prepare.mjs'], { cwd: root, timeout: 120_000 });
  const bundle = await readFile(join(root, 'server/server.mjs'), 'utf8');
  assert.doesNotMatch(bundle, /(?:from\s*|import\s*\()\s*["']vite["']/);
  await rm(join(root, 'node_modules'), { recursive: true });
  await rm(join(root, 'client/.vite'), { recursive: true });
  const app = await import(pathToFileURL(join(root, 'server/server.mjs')).href);
  assert(app.components.modules instanceof Map);
  assert(app.components.modules.get('registry-card').preload.length > 0);
  await new Promise((ok) => app.server.listen(0, '127.0.0.1', ok));
  const address = app.server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const html = await (await fetch(origin)).text();
    assert.match(html, /Registry SSR/);
    assert.match(html, /registry-card.*shadowrootmode/s);
    for (const url of app.components.modules.get('registry-card').preload)
      assert(await readFile(join(root, 'client', url)));
    assert.equal(app.state.peer, '127.0.0.1');
    assert.equal(app.state.origin, 'https://app.example');
    const upgrade = (path, header) =>
      new Promise((ok, fail) => {
        const req = request(origin + path, {
          headers: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: header },
        });
        req.on('upgrade', (response, socket) => {
          socket.destroy();
          ok(response.statusCode);
        });
        req.on('response', (response) => {
          response.resume();
          ok(response.statusCode);
        });
        req.on('error', fail);
        req.end();
      });
    assert.equal(await upgrade('/ws', 'https://app.example'), 101);
    assert.equal(await upgrade('/ws', 'https://evil.example'), 403);
    assert.equal(await upgrade('/other', 'https://app.example'), 403);
    const response = await fetch(origin + '/cancel');
    const reader = response.body.getReader();
    await reader.read();
    await reader.cancel();
    for (let attempt = 0; !app.state.aborted && attempt < 100; attempt++)
      await new Promise((ok) => setTimeout(ok, 10));
    assert.equal(app.state.aborted, true);
    assert.equal(app.state.count, 2);
    console.log(
      `Registry-only 0.3.8: one ${Buffer.byteLength(bundle)}-byte server, no runtime Vite/node_modules/.vite; metadata, HTTP/upgrade/cancel checks passed.`,
    );
  } finally {
    await new Promise((ok, fail) => app.server.close((error) => (error ? fail(error) : ok())));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

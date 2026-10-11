// Optional, networked spike: public host-framework boundaries and native server runtimes.
// Renderer implementations are black boxes; no source is inspected or copied.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'vite';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'gyral-platforms-'));
const alias = [
  ['@gyral/core/internal/server', 'packages/core/src/server.ts'],
  ['@gyral/core/internal', 'packages/core/src/internal.ts'],
  ['@gyral/core', 'packages/core/src/index.ts'],
  ['@gyral/ssr', 'packages/ssr/src/index.ts'],
].map(([find, file]) => ({ find, replacement: join(root, file) }));
const bundle = async (entry, options = {}) => {
  const result = await build({
    configFile: false,
    root: temp,
    logLevel: 'warn',
    resolve: { alias, conditions: ['browser', 'production'] },
    ...options,
    build: {
      write: false,
      minify: false,
      target: 'es2023',
      lib: { entry, formats: ['es'] },
      rolldownOptions: { output: { codeSplitting: false } },
      ...options.build,
    },
  });
  const outputs = Array.isArray(result) ? result.flatMap((r) => r.output) : result.output;
  const chunks = outputs.filter((o) => o.type === 'chunk');
  assert.equal(chunks.length, 1, 'spike needs a self-contained bundle');
  return chunks[0].code;
};

try {
  await cp(join(root, 'scripts/spikes'), temp, { recursive: true });
  await writeFile(join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  console.log('platforms: installing pinned hosts and local Workers harness in a temp directory');
  await exec(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      'react@19.2.8',
      'react-dom@19.2.8',
      'vue@3.5.43',
      'svelte@5.57.2',
      'wrangler@4.147.0',
    ],
    { cwd: temp, maxBuffer: 5_000_000 },
  );
  const require = createRequire(join(temp, 'package.json'));
  const { compile } = require('svelte/compiler');
  const hosts = await bundle(join(temp, 'hosts.mjs'), {
    resolve: {
      alias: [
        ...alias,
        {
          find: 'vue',
          replacement: require.resolve('vue/dist/vue.esm-bundler.js'),
        },
      ],
      conditions: ['browser', 'production'],
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    plugins: [
      {
        name: 'spike-svelte',
        transform(code, id) {
          if (!id.endsWith('.svelte')) return;
          return compile(code, { filename: id, generate: 'client' }).js.code;
        },
      },
    ],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Host spike</title></head><body></body></html>',
    );
    await page.addScriptTag({
      path: createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
    });
    const results = await page.evaluate(async (code) => {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      try {
        const host = await import(url);
        return await host.runHosts();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, hosts);
    assert.deepEqual(results, { react: true, vue: true, svelte: true, accessibility: true });
    assert.deepEqual(errors, []);
    console.log(
      'platforms: React 19, Vue 3, Svelte 5 props, updates, outputs and shadow-root axe passed',
    );
  } finally {
    await browser.close();
  }

  const runtime = join(temp, 'server.mjs');
  await writeFile(runtime, await bundle(join(temp, 'runtime.mjs')));
  const { runChecks } = await import(pathToFileURL(runtime).href);
  assert.equal((await runChecks()).ok, true);
  console.log(
    'platforms: Node native SSR streams, slots, store isolation, CSP and cancellation passed',
  );
  const denoEntry = join(temp, 'deno.mjs');
  await writeFile(
    denoEntry,
    'import { runChecks } from "./server.mjs"; console.log(JSON.stringify(await runChecks()));',
  );
  const deno = await exec('pnpm', ['dlx', 'deno@2.9.6', 'run', denoEntry], {
    cwd: temp,
    maxBuffer: 1_000_000,
  });
  assert.equal(JSON.parse(deno.stdout.trim()).ok, true);
  console.log('platforms: Deno 2.9.6 native SSR checks passed (no DOM shim or permissions)');

  const { createTestHarness } = require('wrangler');
  const worker = createTestHarness({
    root: temp,
    workers: [
      {
        config: {
          name: 'gyral-platform-spike',
          main: runtime,
          compatibility_date: '2025-01-01',
        },
      },
    ],
  });
  try {
    await worker.listen();
    const response = await worker.fetch('/');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    console.log('platforms: local workerd native SSR checks passed (no nodejs_compat)');
  } finally {
    await worker.close();
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

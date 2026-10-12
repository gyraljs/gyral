import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export interface Ownership {
  readonly loader: string;
  readonly chunks: Readonly<Record<string, string>>;
  readonly chunkModules: Readonly<Record<string, readonly string[]>>;
}
export async function pwaRelease(root: string, release: string): Promise<string> {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ type: 'module', sideEffects: true }),
    'index.html': `<!doctype html><html lang="en"><head><title>Offline features</title></head>
      <body><h1>Offline features</h1><button id="load">Load feature</button><div id="mount"></div>
      <script type="module" src="/src/main.ts"></script></body></html>`,
    'src/main.ts': `
      import 'virtual:gyral/components';
      const ready = navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
      document.querySelector('#load').addEventListener('click', async () => {
        document.querySelector('#mount').innerHTML = '<offline-feature></offline-feature>';
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => { document.documentElement.dataset.worker = event.data; worker.terminate(); };
      });
      ready.then(() => { document.documentElement.dataset.ready = 'true'; });`,
    'src/worker.ts': `postMessage(${JSON.stringify(release)});`,
    'workspace/shared.ts': `import './shared.css'; export const label = ${JSON.stringify(release)};`,
    'workspace/shared.css': '.feature { color: rgb(10, 20, 30); }',
    'workspace/feature/entry.ts': `
      import { define, html } from '@gyral/core'; import { label } from '../shared.ts'; import './child.ts';
      define()('offline-feature', { init: () => ({}), view: () => html\`<p class="feature">Feature \${label}</p><offline-child></offline-child>\` });`,
    'workspace/feature/child.ts': `
      import { define, html } from '@gyral/core';
      define()('offline-child', { init: () => ({}), view: () => html\`<b>Grouped child</b>\` });`,
    'workspace/other.ts': `
      import { define, html } from '@gyral/core'; import { label } from './shared.ts';
      define()('offline-other', { init: () => ({}), view: () => html\`<p>Other \${label}</p>\` });`,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  const dist = join(root, release);
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    ...gyralVitePreset({
      components: {
        include: ['workspace'],
        modules: { 'offline-child': 'workspace/feature/entry.ts' },
      },
    }),
    build: { outDir: dist, rolldownOptions: { input: join(root, 'index.html') } },
  });
  const urls = [
    '/index.html',
    ...readdirSync(join(dist, 'assets')).map((file) => `/assets/${file}`),
  ];
  // This is application cache policy: deliberately keep prior releases until an app-defined
  // retention deadline. A current worker can therefore serve a still-open old tab's URLs.
  writeFileSync(
    join(dist, 'sw.js'),
    `
    const cache = 'offline-${release}';
    self.addEventListener('install', (event) => event.waitUntil(caches.open(cache).then((store) => store.addAll(${JSON.stringify(urls)})).then(() => self.skipWaiting())));
    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', (event) => {
      event.respondWith((async () => {
        if (event.request.mode === 'navigate') {
          try { return await fetch(event.request); } catch { return (await caches.open(cache)).match('/index.html'); }
        }
        return (await caches.match(event.request)) || fetch(event.request);
      })());
    });`,
  );
  return dist;
}
export function ownership(dist: string): Ownership {
  return JSON.parse(readFileSync(join(dist, '.vite/gyral-components.json'), 'utf8')) as Ownership;
}

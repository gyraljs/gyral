/// <reference types="node" />
// Build step after `vite build`: renders every `ssg` route to dist/static (gyral-4k7.3).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import { staticPaths } from '../src/routes.js';
import { createApp } from './app.js';

export async function prerenderSite(distDir: string): Promise<readonly string[]> {
  const clientEntry = await clientEntryFromManifest(
    join(distDir, 'client', '.vite', 'manifest.json'),
    'src/entry-client.ts',
  );
  const pages = await prerender({
    app: createApp({ clientEntry }),
    paths: staticPaths(),
    outDir: join(distDir, 'static'),
  });
  return pages.map((p) => p.path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  const paths = await prerenderSite(dist);
  console.log(`prerendered: ${paths.join(', ')}`);
}

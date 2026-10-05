// Production server (gyral-4k7.3): hashed client assets are served immutable, prerendered
// (`ssg`) pages from disk, and everything else is rendered per request by the same app the
// prerender step used.
import { productionServer, type FetchApp } from '@gyral/ssr/static';
import { createApp } from './app.js';

export interface ProdOptions {
  /** The build output: `client/` (Vite) and `static/` (prerendered pages). */
  readonly distDir: string;
}

export function createProdApp(options: ProdOptions): Promise<FetchApp> {
  return productionServer({ distDir: options.distDir, createApp });
}

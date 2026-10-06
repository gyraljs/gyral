/// <reference types="node" />
// Static generation and production serving helpers (gyral-4k7.3, ADR 0016). Server-only and
// Node-only, so they live on their own subpath (`@gyral/ssr/static`) and the main entry stays
// runtime-neutral. One route table, three modes:
// - `ssg`: rendered at build time by the same app that serves `ssr` routes, written as files;
// - `ssr`: rendered per request;
// - `csr`: not prerendered; the client renders it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';

/** How a route is rendered. */
export type RenderMode = 'ssg' | 'ssr' | 'csr';

/** Anything with a fetch handler: a Hono app, or a plain function. */
export interface FetchApp {
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

export interface PrerenderOptions {
  readonly app: FetchApp;
  /** URL paths to render, e.g. every `ssg` route of the route table. */
  readonly paths: readonly string[];
  /** Directory the HTML files go to (`/about` → `<outDir>/about/index.html`). */
  readonly outDir: string;
  /** Origin used for the requests (absolute URLs in canonical links etc.). */
  readonly origin?: string;
}

export interface PrerenderedPage {
  readonly path: string;
  readonly file: string;
  readonly status: number;
}

/** The file a prerendered path is written to and served from. */
export function staticFileFor(outDir: string, path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (clean.split('/').some((part) => part === '..')) throw new Error(`unsafe path ${path}`);
  return join(outDir, clean, 'index.html');
}

/**
 * Renders each path through the app (exactly what a request would get) and writes the HTML.
 * A non-200 response fails the build: an `ssg` route must render successfully.
 */
export async function prerender(options: PrerenderOptions): Promise<readonly PrerenderedPage[]> {
  const origin = options.origin ?? 'http://localhost';
  const pages: PrerenderedPage[] = [];
  for (const path of options.paths) {
    const response = await options.app.fetch(new Request(new URL(path, origin)));
    if (response.status !== 200) {
      throw new Error(`prerender ${path}: expected 200, got ${String(response.status)}`);
    }
    const file = staticFileFor(options.outDir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await response.text());
    pages.push({ path, file, status: response.status });
  }
  return pages;
}

/** The subset of Vite's `.vite/manifest.json` used to find built entry chunks. */
type ViteManifest = Readonly<Record<string, { readonly file: string; readonly css?: string[] }>>;

/**
 * The URL of a built entry chunk (e.g. `src/entry-client.ts` → `/assets/entry-client-Ab12.js`),
 * read from a Vite build manifest (`build.manifest: true`).
 */
export async function clientEntryFromManifest(
  manifestPath: string,
  entry: string,
): Promise<string> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;
  const chunk = manifest[entry];
  if (chunk === undefined) throw new Error(`${entry} is not an entry in ${manifestPath}`);
  return `/${chunk.file}`;
}

export interface ProductionOptions {
  /** Build output: `client/` (Vite, with `.vite/manifest.json`) and `static/` (prerendered). */
  readonly distDir: string;
  /** The client entry as named in the Vite manifest. Default `src/entry-client.ts`. */
  readonly entry?: string;
  /** Builds the request-time renderer (the same app the prerender step used). */
  readonly createApp: (options: { readonly clientEntry: string }) => FetchApp;
}

const ASSET_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function readOrUndefined(file: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    return new Uint8Array(await readFile(file));
  } catch {
    return undefined;
  }
}

/**
 * A production request handler (framework-neutral: mount its `fetch` in Hono, Node, …):
 * - `GET /assets/*`: content-hashed client build output, cached immutable;
 * - `GET` of a prerendered path: the `static/` file, revalidated on every use;
 * - everything else (other GETs, POSTs): the request-time app, `no-cache` unless it set one.
 */
export async function productionServer(options: ProductionOptions): Promise<FetchApp> {
  const clientDir = resolve(options.distDir, 'client');
  const staticDir = resolve(options.distDir, 'static');
  const clientEntry = await clientEntryFromManifest(
    join(clientDir, '.vite', 'manifest.json'),
    options.entry ?? 'src/entry-client.ts',
  );
  const app = options.createApp({ clientEntry });
  return {
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (request.method === 'GET' && pathname.startsWith('/assets/')) {
        const file = resolve(clientDir, `.${decodeURIComponent(pathname)}`);
        const body = file.startsWith(`${clientDir}${sep}`)
          ? await readOrUndefined(file)
          : undefined;
        if (body === undefined) return new Response('Not found', { status: 404 });
        const type = ASSET_TYPES[extname(file)] ?? 'application/octet-stream';
        return new Response(body, { headers: { 'content-type': type, ...cacheHeaders.immutable } });
      }
      if (request.method === 'GET') {
        const page = await readOrUndefined(staticFileFor(staticDir, pathname));
        if (page !== undefined) {
          return new Response(page, {
            headers: { 'content-type': 'text/html; charset=utf-8', ...cacheHeaders.revalidate },
          });
        }
      }
      const response = await app.fetch(request);
      if (response.headers.has('cache-control')) return response;
      const headers = new Headers(response.headers);
      headers.set('cache-control', cacheHeaders.dynamic['cache-control']);
      return new Response(response.body, { status: response.status, headers });
    },
  };
}

/** Cache policy for production serving. */
export const cacheHeaders = {
  /** Content-hashed build assets never change: cache for a year. */
  immutable: { 'cache-control': 'public, max-age=31536000, immutable' },
  /** Prerendered pages may be rebuilt: always revalidate. */
  revalidate: { 'cache-control': 'public, max-age=0, must-revalidate' },
  /** Per-request pages may be personalized. */
  dynamic: { 'cache-control': 'no-cache' },
} as const;

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

/** One chunk of Vite's `.vite/manifest.json` (the fields serving uses). */
export interface ManifestChunk {
  readonly file: string;
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly css?: readonly string[];
}

/** Vite's build manifest (`build.manifest: true`): chunks by source path or chunk key. */
export type ViteManifest = Readonly<Record<string, ManifestChunk>>;

async function readManifest(manifestPath: string): Promise<ViteManifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;
}

function entryChunk(manifest: ViteManifest, entry: string, where: string): ManifestChunk {
  const chunk = manifest[entry];
  if (chunk === undefined) throw new Error(`${entry} is not an entry in ${where}`);
  return chunk;
}

/**
 * The URL of a built entry chunk (e.g. `src/entry-client.ts` → `/assets/entry-client-Ab12.js`),
 * read from a Vite build manifest (`build.manifest: true`).
 */
export async function clientEntryFromManifest(
  manifestPath: string,
  entry: string,
): Promise<string> {
  return `/${entryChunk(await readManifest(manifestPath), entry, manifestPath).file}`;
}

/** What a server-rendered page loads: the client entry and the modules to preload with it. */
export interface ClientAssets {
  /** The entry chunk's URL, for `page({ scripts })`. */
  readonly entry: string;
  /**
   * Chunks the entry is known to need, for `page({ modulepreload })`: the entry itself first
   * (when there is anything else), then its static imports and Gyral's lazily loaded hydration
   * chunk with its imports. Without the hints the browser
   * finds them only after it has fetched and parsed the entry (a server-rendered page would
   * fetch the hydration chunk a round trip later still).
   */
  readonly modulepreload: readonly string[];
}

/**
 * `@gyral/core`'s hydration module (view/07-hydration.md "Loading") as a manifest key: from the
 * published package (any package manager's layout) or from this repository's sources.
 */
const HYDRATION_MODULE =
  /(?:^|\/)(?:@gyral\/core\/dist|packages\/core\/src)\/hydration-client\.[jt]s$/;

/**
 * `ClientAssets` for `entry`, from a manifest already in memory. `also`: manifest keys of
 * modules the page will import lazily (a route's module, by source path such as
 * `src/routes/product.ts`), preloaded too, each with its static imports, after the entry's.
 */
export function clientAssets(
  manifest: ViteManifest,
  entry: string,
  also: readonly string[] = [],
): ClientAssets {
  const root = entryChunk(manifest, entry, 'the Vite manifest');
  const seen = new Set<string>([entry]);
  const urls: string[] = [];
  /** Adds the static imports of a chunk, depth first, each once. */
  const addImports = (chunk: ManifestChunk): void => {
    for (const key of chunk.imports ?? []) {
      const imported = manifest[key];
      if (seen.has(key) || imported === undefined) continue;
      seen.add(key);
      addImports(imported);
      urls.push(`/${imported.file}`);
    }
  };
  addImports(root);
  const loaded = [...seen].flatMap((key) => manifest[key]?.dynamicImports ?? []);
  const hydration = loaded.find((key) => HYDRATION_MODULE.test(key));
  const chunk = hydration === undefined ? undefined : manifest[hydration];
  if (hydration !== undefined && chunk !== undefined && !seen.has(hydration)) {
    seen.add(hydration);
    addImports(chunk);
    urls.push(`/${chunk.file}`);
  }
  for (const key of also) {
    const lazy = manifest[key];
    if (lazy === undefined) throw new Error(`${key} is not a module in the Vite manifest`);
    if (seen.has(key)) continue;
    seen.add(key);
    addImports(lazy);
    urls.push(`/${lazy.file}`);
  }
  const url = `/${root.file}`;
  // When anything is preloaded, the entry itself comes first: with route chunks added (`also`)
  // it would otherwise queue behind them on HTTP/1.1's six connections and start later than
  // with no preloads at all (found in gyral-shop).
  return { entry: url, modulepreload: urls.length === 0 ? [] : [url, ...urls] };
}

/**
 * `ClientAssets` for `entry`, read from a Vite build manifest (`build.manifest: true`); `also`
 * as for `clientAssets`.
 */
export async function clientAssetsFromManifest(
  manifestPath: string,
  entry: string,
  also: readonly string[] = [],
): Promise<ClientAssets> {
  const manifest = await readManifest(manifestPath);
  entryChunk(manifest, entry, manifestPath);
  return clientAssets(manifest, entry, also);
}

export interface ProductionOptions {
  /** Build output: `client/` (Vite, with `.vite/manifest.json`) and `static/` (prerendered). */
  readonly distDir: string;
  /** The client entry as named in the Vite manifest. Default `src/entry-client.ts`. */
  readonly entry?: string;
  /**
   * Builds the request-time renderer (the same app the prerender step used). Pass
   * `modulepreload` on to `renderPage({ modulepreload })` so pages preload what the entry needs.
   * A page that imports modules lazily (a route's chunk) passes `preload(modules)` instead:
   * the same list plus those modules and their imports (`clientAssets`' `also`).
   */
  readonly createApp: (options: {
    readonly clientEntry: string;
    readonly modulepreload: readonly string[];
    readonly preload: (modules: readonly string[]) => readonly string[];
  }) => FetchApp;
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
  const manifestPath = join(clientDir, '.vite', 'manifest.json');
  const entry = options.entry ?? 'src/entry-client.ts';
  const manifest = await readManifest(manifestPath);
  entryChunk(manifest, entry, manifestPath);
  const assets = clientAssets(manifest, entry);
  const preloads = new Map<string, readonly string[]>();
  const app = options.createApp({
    clientEntry: assets.entry,
    modulepreload: assets.modulepreload,
    preload: (modules) => {
      const key = modules.join('\n');
      let urls = preloads.get(key);
      if (urls === undefined) {
        urls = clientAssets(manifest, entry, modules).modulepreload;
        preloads.set(key, urls);
      }
      return urls;
    },
  });
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

/// <reference types="node" />
// Static generation and production serving helpers (gyral-4k7.3, ADR 0016). Server-only and
// Node-only, so they live on their own subpath (`@gyral/ssr/static`) and the main entry stays
// runtime-neutral. One route table, three modes:
// - `ssg`: rendered at build time by the same app that serves `ssr` routes, written as files;
// - `ssr`: rendered per request;
// - `csr`: not prerendered; the client renders it.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  assetHandler,
  cacheHeaders,
  fileResponse,
  readOrUndefined,
  staticFileFor,
} from './assets.js';
import type { ComponentAssets } from './components.js';
export {
  writeComponentStyleManifest,
  type ComponentStyleManifest,
  type ComponentStyleManifestOptions,
} from './style-manifest.js';
import {
  basePath,
  clientAssets,
  componentsFromManifest,
  readManifest,
  type ViteManifest,
} from './manifest.js';

export { assetHandler, type AssetHandler, type AssetHandlerOptions } from './assets.js';
export {
  clientAssetsFromManifest,
  componentsFromManifest,
  type ClientAssets,
  type ManifestOptions,
  type ManifestChunk,
  type ViteManifest,
} from './manifest.js';

/** How a route is rendered. */
export type RenderMode = 'ssg' | 'ssr' | 'csr';

/**
 * Anything with a fetch handler: a Hono app, or a plain function. `env` is what the server
 * passes along (`toNodeListener`'s `{ incoming, remoteAddress }`); a prerender passes none.
 */
export interface FetchApp<Env = unknown> {
  readonly fetch: (request: Request, env?: Env) => Response | Promise<Response>;
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

export interface ProductionOptions<Env = unknown> {
  /** Build output: `client/` (Vite, with `.vite/manifest.json`) and `static/` (prerendered). */
  readonly distDir: string;
  /**
   * The client entry as named in the Vite manifest. Default `src/entry-client.ts`. A build made
   * with `gyralVitePreset({ components: true })` may have none: pages then load components
   * through `components` alone.
   */
  readonly entry?: string;
  /**
   * The directory served at `/assets/`. Default `<distDir>/client/assets`; point it at a
   * directory that keeps older releases' hashed files too, so tabs opened before a deploy keep
   * loading their chunks.
   */
  readonly assetsDir?: string;
  /**
   * Prerendered pages. Default `<distDir>/static`; `false` when the app prerenders nothing, so
   * page requests don't look for files first.
   */
  readonly staticDir?: string | false;
  /**
   * Vite's `base` when the build is served under a path (e.g. `/app/`): the entry, preload and
   * stylesheet URLs start with it, and assets are served at `<base>assets/`. Default `/`.
   */
  readonly base?: string;
  /** Keep served assets in memory (`assetHandler`'s `cache`). Default `true`. */
  readonly cache?: boolean | { readonly maxBytes: number };
  /**
   * Builds the request-time renderer (the same app the prerender step used). Pass
   * `modulepreload` and `stylesheets` on to `renderPage` so pages preload what the entry needs
   * and link its hashed CSS. A page that imports modules lazily (a route's chunk) spreads
   * `assets(modules)` instead: both lists plus those modules, their imports and their CSS
   * (`clientAssetsFromManifest`' `also`). `preload(modules)` is `assets(modules).modulepreload`.
   */
  readonly createApp: (options: AppAssets) => FetchApp<Env>;
  /**
   * Sees every response before it goes out (built assets, prerendered pages and the app's), to
   * add headers such as a CSP or security headers, or cookies. Return the response to send.
   */
  readonly onResponse?: (response: Response, request: Request) => Response | Promise<Response>;
}

/** The page-level parts of `ClientAssets`, named as `renderPage` takes them. */
export interface PageAssets {
  readonly modulepreload: readonly string[];
  readonly stylesheets: readonly string[];
}

/** What `productionServer` hands `createApp`: the built entry and what pages link with it. */
export interface AppAssets extends PageAssets {
  /** The built client entry's URL; undefined when the build has none (components only). */
  readonly clientEntry: string | undefined;
  /**
   * For `renderPage({ components })` when the build was made with
   * `gyralVitePreset({ components: true })`: each page links exactly the components it rendered.
   */
  readonly components: ComponentAssets | undefined;
  /** `modulepreload` and `stylesheets` with `modules` added (cached per list). */
  readonly assets: (modules: readonly string[]) => PageAssets;
  /** `assets(modules).modulepreload`. */
  readonly preload: (modules: readonly string[]) => readonly string[];
}

/**
 * A production request handler (framework-neutral: mount its `fetch` in Hono, Node, …):
 * - `GET`/`HEAD /assets/*`: content-hashed client build output, cached immutable
 *   (`assetHandler`);
 * - `GET`/`HEAD` of a prerendered path: the `static/` file, revalidated on every use;
 * - everything else (other GETs, POSTs): the request-time app, `no-cache` unless it set one.
 *
 * Its `fetch` passes the server's `env` (`toNodeListener`'s `{ incoming, remoteAddress }`) on to
 * the app, so the app can read the client's address.
 */
export async function productionServer<Env = unknown>(
  options: ProductionOptions<Env>,
): Promise<FetchApp<Env>> {
  const clientDir = resolve(options.distDir, 'client');
  const staticDir =
    options.staticDir === false
      ? undefined
      : resolve(options.staticDir ?? join(options.distDir, 'static'));
  const manifestPath = join(clientDir, '.vite', 'manifest.json');
  const manifest = await readManifest(manifestPath);
  const where = options.base === undefined ? {} : { base: options.base };
  const components = await componentsFromManifest(clientDir, where);
  const entry = entryOf(manifest, options.entry, components !== undefined, manifestPath);
  const pageAssets = (modules: readonly string[]): PageAssets => {
    if (entry !== undefined) {
      const { modulepreload, css } = clientAssets(manifest, entry, modules, where);
      return { modulepreload, stylesheets: css };
    }
    const [first, ...rest] = modules;
    if (first === undefined) return { modulepreload: [], stylesheets: [] };
    const { entry: url, modulepreload, css } = clientAssets(manifest, first, rest, where);
    return { modulepreload: modulepreload.length === 0 ? [url] : modulepreload, stylesheets: css };
  };
  const cached = new Map<string, PageAssets>();
  const assets = (modules: readonly string[]): PageAssets => {
    const key = modules.join('\n');
    let found = cached.get(key);
    if (found === undefined) {
      found = pageAssets(modules);
      cached.set(key, found);
    }
    return found;
  };
  const serveAsset = assetHandler({
    dir: options.assetsDir ?? join(clientDir, 'assets'),
    prefix: `${basePath(options.base)}assets/`,
    ...(options.cache === undefined ? {} : { cache: options.cache }),
  });
  const app = options.createApp({
    clientEntry: entry === undefined ? undefined : clientAssets(manifest, entry, [], where).entry,
    components,
    ...assets([]),
    assets,
    preload: (modules) => assets(modules).modulepreload,
  });
  const { onResponse } = options;
  const respond = async (request: Request, env: Env | undefined): Promise<Response> => {
    const asset = await serveAsset(request);
    if (asset !== undefined) return asset;
    const read = request.method === 'GET' || request.method === 'HEAD';
    if (read && staticDir !== undefined) {
      const page = await readOrUndefined(staticFileFor(staticDir, new URL(request.url).pathname));
      if (page !== undefined) {
        return fileResponse(
          request.method,
          page,
          'text/html; charset=utf-8',
          cacheHeaders.revalidate,
        );
      }
    }
    const response = await app.fetch(request, env);
    if (response.headers.has('cache-control')) return response;
    const headers = new Headers(response.headers);
    headers.set('cache-control', cacheHeaders.dynamic['cache-control']);
    return new Response(response.body, { status: response.status, headers });
  };
  return {
    fetch: async (request, env) => {
      const response = await respond(request, env);
      return onResponse === undefined ? response : onResponse(response, request);
    },
  };
}

/**
 * The manifest key of the client entry: the one named, else `src/entry-client.ts` when the
 * manifest has it; none for a components-only build. A named entry that's missing is an error.
 */
function entryOf(
  manifest: ViteManifest,
  named: string | undefined,
  components: boolean,
  where: string,
): string | undefined {
  const entry = named ?? 'src/entry-client.ts';
  if (manifest[entry] !== undefined) return entry;
  if (named === undefined && components) return undefined;
  throw new Error(`${entry} is not an entry in ${where}`);
}

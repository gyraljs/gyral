/// <reference types="node" />
// Reading Vite's build manifest (ADR 0016, view/07-hydration.md "Loading"): the hashed client
// entry, the modules to preload with it and the stylesheets to link. Exported from
// `@gyral/ssr/static`.
import { readFile } from 'node:fs/promises';

/** One chunk of Vite's `.vite/manifest.json` (the fields serving uses). */
export interface ManifestChunk {
  readonly file: string;
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly css?: readonly string[];
}

/** Vite's build manifest (`build.manifest: true`): chunks by source path or chunk key. */
export type ViteManifest = Readonly<Record<string, ManifestChunk>>;

export async function readManifest(manifestPath: string): Promise<ViteManifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;
}

/** Where the build is served: Vite's `base` (default `/`), which the manifest's paths omit. */
export interface ManifestOptions {
  /** Vite's `base`, e.g. `/app/` (a missing trailing slash is added). Default `/`. */
  readonly base?: string;
}

/** The URL prefix for `base`: always starts and ends with `/`. */
export const basePath = (base = '/'): string =>
  `${base.startsWith('/') ? '' : '/'}${base}${base.endsWith('/') ? '' : '/'}`;

export function entryChunk(manifest: ViteManifest, entry: string, where: string): ManifestChunk {
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
  options: ManifestOptions = {},
): Promise<string> {
  return (
    basePath(options.base) + entryChunk(await readManifest(manifestPath), entry, manifestPath).file
  );
}

/** What a server-rendered page loads: the client entry, the modules to preload, the CSS. */
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
  /**
   * The hashed CSS files of those chunks, for `page({ stylesheets })`: what Vite emitted for
   * CSS imported by the entry, its static imports and the `also` modules, each chunk's after
   * its imports' (module order), each file once.
   */
  readonly css: readonly string[];
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
 * `options.base`: Vite's `base`, which every URL starts with (the manifest's paths omit it).
 */
export function clientAssets(
  manifest: ViteManifest,
  entry: string,
  also: readonly string[] = [],
  options: ManifestOptions = {},
): ClientAssets {
  const base = basePath(options.base);
  const root = entryChunk(manifest, entry, 'the Vite manifest');
  const seen = new Set<string>([entry]);
  const urls: string[] = [];
  const css = new Set<string>();
  /** Adds a chunk's static imports (depth first, each once), then the chunk itself. */
  const add = (chunk: ManifestChunk, self: boolean): void => {
    for (const key of chunk.imports ?? []) {
      const imported = manifest[key];
      if (seen.has(key) || imported === undefined) continue;
      seen.add(key);
      add(imported, true);
    }
    if (self) urls.push(base + chunk.file);
    for (const file of chunk.css ?? []) css.add(base + file);
  };
  add(root, false);
  const loaded = [...seen].flatMap((key) => manifest[key]?.dynamicImports ?? []);
  const hydration = loaded.find((key) => HYDRATION_MODULE.test(key));
  const chunk = hydration === undefined ? undefined : manifest[hydration];
  if (hydration !== undefined && chunk !== undefined && !seen.has(hydration)) {
    seen.add(hydration);
    add(chunk, true);
  }
  for (const key of also) {
    const lazy = manifest[key];
    if (lazy === undefined) throw new Error(`${key} is not a module in the Vite manifest`);
    if (seen.has(key)) continue;
    seen.add(key);
    add(lazy, true);
  }
  const url = base + root.file;
  // When anything is preloaded, the entry itself comes first: with route chunks added (`also`)
  // it would otherwise queue behind them on HTTP/1.1's six connections and start later than
  // with no preloads at all (found in gyral-shop).
  return {
    entry: url,
    modulepreload: urls.length === 0 ? [] : [url, ...urls],
    css: [...css],
  };
}

/**
 * `ClientAssets` for `entry`, read from a Vite build manifest (`build.manifest: true`); `also`
 * as for `clientAssets`.
 */
export async function clientAssetsFromManifest(
  manifestPath: string,
  entry: string,
  also: readonly string[] = [],
  options: ManifestOptions = {},
): Promise<ClientAssets> {
  const manifest = await readManifest(manifestPath);
  entryChunk(manifest, entry, manifestPath);
  return clientAssets(manifest, entry, also, options);
}

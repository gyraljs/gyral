// Automatic component loading (`gyralVitePreset({ components })`, ADR 0016 addendum "Automatic
// component loading"): finds the app's components, adds a loader to the client build that
// imports a tag's module once the tag is in the page, and writes the manifest
// `@gyral/ssr/static`'s `componentsFromManifest` reads. ../vite.ts loads it on the plugin's
// first hook, as it loads the compiler.
import { relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import type { ComponentsOptions } from '../vite.js';
import { loaderSource } from './loader-source.js';
import { discoverComponents } from './tag-map.js';

/** The loader module's id, and Vite's id for it (a virtual module). */
const COMPONENTS_ID = 'virtual:gyral/components';
const COMPONENTS_RESOLVED = `\0${COMPONENTS_ID}`;
/** The file the build writes next to `.vite/manifest.json` (read by `@gyral/ssr/static`). */
const COMPONENTS_MANIFEST = '.vite/gyral-components.json';

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * Tag → root-relative URL (`/src/…`) of the module defining it: ./tag-map.ts's scan, then the
 * `modules` the app lists for components the scan can't see (defined through a wrapper).
 */
function scanComponents(
  root: string,
  include: readonly string[],
  listed: Readonly<Record<string, string>> = {},
): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag, path] of Object.entries(listed)) {
    tags.set(tag, `/${relative(root, resolve(root, path)).split(sep).join('/')}`);
  }
  for (const { tag, file } of discoverComponents(root, include)) {
    const url = `/${relative(root, file).split(sep).join('/')}`;
    const known = tags.get(tag);
    if (known === undefined) tags.set(tag, url);
    else if (known !== url && listed[tag] === undefined) {
      console.warn(`gyral: <${tag}> is defined in ${known} and ${url}; loading ${known}`);
    }
  }
  return tags;
}

type Input = string | readonly string[] | Readonly<Record<string, string>> | undefined;

/** The client build's input with the loader added. */
function withLoader(input: Input): string[] | Record<string, string> {
  if (input === undefined) return { components: COMPONENTS_ID };
  if (typeof input === 'string') {
    const name = input.replace(/^.*\//, '').replace(/\.[^.]*$/, '');
    return { [name]: input, components: COMPONENTS_ID };
  }
  if (Array.isArray(input)) return [...(input as readonly string[]), COMPONENTS_ID];
  return { ...(input as Readonly<Record<string, string>>), components: COMPONENTS_ID };
}

/** The API `gyralDevServer` reads from this plugin (the tags it found, fresh). */
interface ComponentsPluginApi {
  readonly tags: () => ReadonlyMap<string, string>;
}

/** Automatic component loading (`gyralVitePreset({ components })`). */
export function createComponents(options: ComponentsOptions): Plugin {
  const include = options.include ?? ['src'];
  let root = process.cwd();
  let tags = new Map<string, string>();
  const scan = (): Map<string, string> => (tags = scanComponents(root, include, options.modules));
  const api: ComponentsPluginApi = { tags: scan };
  return {
    name: 'gyral:components',
    api,
    config(config, env) {
      root = resolve(config.root ?? process.cwd());
      if (env.command !== 'build' || env.isSsrBuild === true) return;
      type Build = {
        manifest?: boolean | string;
        rollupOptions?: { input?: Input };
        rolldownOptions?: { input?: Input };
      };
      const build = ((config as { build?: Build }).build ??= {});
      const key = build.rolldownOptions !== undefined ? 'rolldownOptions' : 'rollupOptions';
      const bundler = (build[key] ??= {});
      bundler.input = withLoader(bundler.input);
      build.manifest ??= true;
    },
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      scan();
    },
    resolveId(source) {
      return source === COMPONENTS_ID ? COMPONENTS_RESOLVED : null;
    },
    load(id) {
      if (id !== COMPONENTS_RESOLVED) return null;
      if (this.environment.config.command === 'serve') scan();
      return loaderSource(tags);
    },
    configureServer(server) {
      // A new or edited component module changes the loader's table.
      const refresh = (file: string): void => {
        if (!SOURCE_FILE.test(file)) return;
        const module = server.environments.client.moduleGraph.getModuleById(COMPONENTS_RESOLVED);
        if (module !== undefined) server.environments.client.moduleGraph.invalidateModule(module);
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
      server.watcher.on('change', refresh);
    },
    generateBundle(_output, bundle) {
      if (this.environment.config.consumer !== 'client') return;
      const loader = Object.values(bundle).find(
        (chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === COMPONENTS_RESOLVED,
      );
      if (loader?.type !== 'chunk') return;
      const modules = Object.fromEntries([...tags].map(([tag, url]) => [tag, url.slice(1)]));
      // Each tag's chunk by file. A module another chunk imports statically is bundled into
      // that chunk (often the entry), so Vite's manifest has no key for it; the server finds
      // the chunk by file instead (`componentAssets`).
      const chunkOf = new Map<string, string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of chunk.moduleIds) chunkOf.set(id, chunk.fileName);
      }
      const chunks: Record<string, string> = {};
      for (const [tag, url] of tags) {
        const file = chunkOf.get(resolve(root, url.slice(1)));
        if (file !== undefined) chunks[tag] = file;
      }
      const written = { loader: loader.fileName, loaderImports: loader.imports, modules, chunks };
      this.emitFile({
        type: 'asset',
        fileName: COMPONENTS_MANIFEST,
        source: `${JSON.stringify(written, null, 2)}\n`,
      });
    },
  };
}

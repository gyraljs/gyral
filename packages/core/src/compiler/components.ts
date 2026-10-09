// Automatic component loading (`gyralVitePreset({ components })`, ADR 0016 addendum "Automatic
// component loading"): finds the app's components, adds a loader to the client build that
// imports a tag's module once the tag is in the page, and writes the manifest
// `@gyral/ssr/static`'s `componentsFromManifest` reads. ../vite.ts loads it on the plugin's
// first hook, as it loads the compiler.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import type { ComponentsOptions } from '../vite.js';
import { loaderSource } from './loader-source.js';

/** The loader module's id, and Vite's id for it (a virtual module). */
const COMPONENTS_ID = 'virtual:gyral/components';
const COMPONENTS_RESOLVED = `\0${COMPONENTS_ID}`;
/** The file the build writes next to `.vite/manifest.json` (read by `@gyral/ssr/static`). */
const COMPONENTS_MANIFEST = '.vite/gyral-components.json';

/**
 * A two-call `define<…>()('tag', …)`: the generics (lazy, so nested `<…>` extend it), the
 * empty call, then a string tag with a hyphen. `customElements.define(` doesn't match.
 */
const DEFINE_TAG =
  /(?<![.\w$])define\s*(?:<[\s\S]*?>)?\s*\(\s*\)\s*\(\s*(['"`])([a-z][a-z0-9._-]*-[a-z0-9._-]*)\1/g;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Tag → root-relative URL (`/src/…`) of the module defining it, from the source files. */
function scanComponents(root: string, include: readonly string[]): Map<string, string> {
  const tags = new Map<string, string>();
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(path);
        continue;
      }
      if (!SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue;
      const code = readFileSync(path, 'utf8');
      if (!code.includes('define')) continue;
      for (const match of code.matchAll(DEFINE_TAG)) {
        const tag = match[2] as string;
        const url = `/${relative(root, path).split(sep).join('/')}`;
        const known = tags.get(tag);
        if (known === undefined) tags.set(tag, url);
        else if (known !== url) {
          console.warn(`gyral: <${tag}> is defined in ${known} and ${url}; loading ${known}`);
        }
      }
    }
  };
  for (const dir of include) walk(resolve(root, dir));
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
  const scan = (): Map<string, string> => (tags = scanComponents(root, include));
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
      this.emitFile({
        type: 'asset',
        fileName: COMPONENTS_MANIFEST,
        source: `${JSON.stringify({ loader: loader.fileName, loaderImports: loader.imports, modules }, null, 2)}\n`,
      });
    },
  };
}

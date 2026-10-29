// One copy of core per app (gyral-k97.2, docs/references/consumer-setup.md "One copy of
// core"). A value one copy makes fails in another (a stylesheet is branded with its copy's
// symbol, a store lives in its copy's registry), far from the cause, so an app and the
// libraries it installs must share one. A second copy comes from one of two places, and
// gyral() covers both:
// - The dev server (and Vitest) pre-bundles dependencies. A package it meets partway through
//   a run is bundled again, with a copy of core of its own, and Vitest reports a reload. The
//   plugin pre-bundles Gyral's installed browser entry points up front, together, and those of
//   the app's dependencies that use Gyral (a design system, say; gyral-337.3).
// - The package manager installed two (a library pinned to another version, or pnpm resolving
//   other peers for it). The plugin reads the installed manifests, and warns once per app, in
//   dev and builds, when @gyral/core resolves to more than one folder.
// `optimize: 'auto'` (the default for a custom server: Vite then has no HTML to crawl) also
// points Vite's startup scan at the modules that define components and at browser tests, so
// every other dependency they import is pre-bundled at startup instead of mid-run.
// In development browsers, core itself warns when a page runs a second copy (view/message.ts).
// Node built-ins only, so ../vite.ts loads it with Node's require, from TypeScript source too
// (which is why it repeats scope.ts's package lookup instead of importing it, and why
// vite.ts hands it the component scan).
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Plugin, UserConfig } from 'vite';

/**
 * Gyral's browser entry points, by package. Never the node-only ones (/vite, /eslint,
 * /internal/server, @gyral/ssr, @gyral/testing/vitest): a page can't load them.
 */
const BROWSER_ENTRIES: Readonly<Record<string, readonly string[]>> = {
  '@gyral/core': ['.', './compiled', './internal', './storage', './indexeddb'],
  '@gyral/http': ['.', './testing', './sse', './websocket'],
  '@gyral/router': ['.'],
  '@gyral/time': ['.'],
  '@gyral/devtools': ['.'],
  '@gyral/testing': ['.'],
};

const CORE = '@gyral/core';
const DOCS = 'https://gyral.dev/errors/#G0015';

interface Manifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly exports?: unknown;
  readonly dependencies?: object;
  readonly devDependencies?: object;
  readonly peerDependencies?: object;
  readonly optionalDependencies?: object;
}

function read(dir: string): Manifest | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The folder of the installed package `name` as seen from `dir` (Node's lookup), real. */
function locate(dir: string, name: string): string | undefined {
  for (let d = dir; ; d = dirname(d)) {
    const candidate = join(d, 'node_modules', name);
    if (read(candidate) !== undefined) {
      try {
        return realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    if (dirname(d) === d) return undefined;
  }
}

/** Installed, not linked: Vite serves a linked package (a workspace's) as source, unbundled. */
const isInstalled = (dir: string): boolean => dir.split(sep).includes('node_modules');

/**
 * The specifiers of Gyral's browser entry points installed for the app at `root`, each one
 * only if that version's exports list it.
 */
export function browserEntries(root: string): string[] {
  const entries: string[] = [];
  for (const [name, subpaths] of Object.entries(BROWSER_ENTRIES)) {
    const dir = locate(root, name);
    if (dir === undefined || !isInstalled(dir)) continue;
    const exported = read(dir)?.exports;
    for (const subpath of subpaths) {
      if (subpath === '.') entries.push(name);
      else if (typeof exported === 'object' && exported !== null && subpath in exported)
        entries.push(name + subpath.slice(1));
    }
  }
  return entries;
}

/** What Vite pre-bundles: script modules only (its `isOptimizable`), not a library's CSS. */
const SCRIPT = /\.[cm]?[jt]s$/;
const BROWSER_CONDITIONS = ['browser', 'import', 'module', 'default', 'development', 'production'];

/** Whether an exports target is a script a browser loads: a path, or one under such conditions. */
function loadsInBrowser(target: unknown): boolean {
  if (typeof target === 'string') return SCRIPT.test(target);
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return false;
  return Object.entries(target).some(
    ([c, t]) => BROWSER_CONDITIONS.includes(c) && loadsInBrowser(t),
  );
}

/** A package's browser subpaths from its exports map: `.` alone without one. */
function browserSubpaths(exported: unknown): string[] {
  if (typeof exported === 'string') return loadsInBrowser(exported) ? ['.'] : [];
  if (typeof exported !== 'object' || exported === null || Array.isArray(exported)) return ['.'];
  const map = exported as Record<string, unknown>;
  if (!Object.keys(map).some((key) => key.startsWith('.'))) return loadsInBrowser(map) ? ['.'] : [];
  return Object.keys(map).filter(
    (key) => key !== './package.json' && !key.includes('*') && loadsInBrowser(map[key]),
  );
}

/**
 * The browser entry points of the app's direct dependencies that use a Gyral browser package
 * (a design system, a set of widgets): they import core, so they must be bundled with the
 * app's copy. Installed packages only; a linked one is served as source.
 */
export function libraryEntries(root: string): string[] {
  const app = resolve(root);
  const m = read(app);
  const names = Object.keys({
    ...m?.dependencies,
    ...m?.devDependencies,
    ...m?.optionalDependencies,
  });
  const entries: string[] = [];
  for (const name of names) {
    if (name.startsWith('@gyral/')) continue;
    const dir = locate(app, name);
    if (dir === undefined || !isInstalled(dir)) continue;
    const lib = read(dir);
    const uses = Object.keys({ ...lib?.dependencies, ...lib?.peerDependencies });
    if (!uses.some((dep) => dep in BROWSER_ENTRIES)) continue;
    for (const sub of browserSubpaths(lib?.exports)) entries.push(name + sub.slice(1));
  }
  return entries;
}

/** A folder @gyral/core is installed in, its version, and the packages that resolve to it. */
export interface CoreCopy {
  readonly dir: string;
  readonly version: string;
  readonly users: readonly string[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '?');

const label = (m: Manifest): string =>
  `${text(m.name)}${typeof m.version === 'string' ? `@${m.version}` : ''}`;

/**
 * Every folder @gyral/core resolves to, from the app at `root` and from each package it
 * installs (a walk of the dependency graph, each package read once), in the order found.
 */
export function coreCopies(root: string): CoreCopy[] {
  const copies = new Map<string, { version: string; users: string[] }>();
  const app = resolve(root);
  const seen = new Set<string>();
  const queue = [app];
  for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
    const m = read(dir);
    if (m === undefined) continue;
    const deps = Object.keys({
      ...m.dependencies,
      ...m.peerDependencies,
      ...m.optionalDependencies,
      ...(dir === app ? m.devDependencies : {}), // an installed package's aren't installed
    });
    for (const name of deps) {
      const at = locate(dir, name);
      if (at === undefined) continue;
      if (name === CORE) {
        const copy = copies.get(at) ?? { version: text(read(at)?.version), users: [] };
        copy.users.push(label(m));
        copies.set(at, copy);
      } else if (!seen.has(at)) {
        seen.add(at);
        queue.push(at);
      }
    }
  }
  return [...copies].map(([dir, { version, users }]) => ({ dir, version, users }));
}

/** The warning for more than one copy (G0015), with paths relative to the app. */
function twoCopies(root: string, copies: readonly CoreCopy[]): string {
  const lines = copies.map(
    (copy) => `  ${copy.version} at ${relative(root, copy.dir)} (${copy.users.join(', ')})`,
  );
  return [
    `gyral: @gyral/core is installed more than once, so the app can run two copies, and a value`,
    `one copy makes (a stylesheet from css, a store) fails in another (G0015, ${DOCS}):`,
    ...lines,
    `Install one copy: pin @gyral/core to one version with your package manager's overrides`,
    `(pnpm or npm \`overrides\`, Yarn \`resolutions\`), then reinstall. Libraries that list it`,
    `as a peer dependency share the app's copy.`,
  ].join('\n');
}

/** Apps already warned about, once per process (each Vitest project resolves a config). */
const warned = new Set<string>();

/** What vite.ts passes the plugin from `gyral(options)`. */
export interface OneCoreOptions {
  /** More modules to pre-bundle, `'auto'` to scan the app's browser modules, or `false`. */
  readonly optimize?: readonly string[] | 'auto' | false;
  /** The files that define components under the app's source folders (./tag-map.ts). */
  readonly components?: (root: string) => readonly string[];
}

/** Vitest's default test files, for a browser project that names none. */
const VITEST_INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];

/**
 * `optimizeDeps.entries` for `optimize: 'auto'`, which is the default when Vite runs as a custom
 * server (`appType: 'custom'`: gyralDevServer, middleware mode), or undefined to keep Vite's
 * HTML crawl. An app's own `entries` win. The scan starts at the modules that define components
 * (browser code by definition: server modules are never scanned) and a Vitest browser
 * project's tests; Vite follows their imports.
 */
function scanEntries(
  config: UserConfig,
  root: string,
  options: OneCoreOptions,
): string[] | undefined {
  if (options.optimize === false || config.optimizeDeps?.entries !== undefined) return undefined;
  if (options.optimize !== 'auto' && config.appType !== 'custom') return undefined;
  const test = (config as { test?: { include?: string[]; browser?: { enabled?: boolean } } }).test;
  const tests = test?.browser?.enabled === true ? (test.include ?? VITEST_INCLUDE) : [];
  const files = (options.components?.(root) ?? []).map((file) => relative(root, file));
  return ['**/*.html', ...new Set(files), ...tests];
}

/**
 * gyral()'s pre-bundling plugin: Gyral's browser entries and the app's Gyral libraries in dev,
 * the app's `optimize` list, the `'auto'` scan; and the warning about a second copy of core.
 */
export function oneCorePlugin(options: OneCoreOptions = {}): Plugin {
  return {
    name: 'gyral:one-core',
    config(config, env) {
      if (env.command !== 'serve') return undefined;
      const root = resolve(config.root ?? process.cwd());
      const listed = new Set(config.optimizeDeps?.include);
      const excluded = config.optimizeDeps?.exclude ?? [];
      const extra = typeof options.optimize === 'object' ? options.optimize : [];
      const wanted = [...browserEntries(root), ...libraryEntries(root), ...extra];
      const include = [...new Set(wanted)].filter(
        (entry) =>
          !listed.has(entry) && !excluded.some((x) => entry === x || entry.startsWith(`${x}/`)),
      );
      const entries = scanEntries(config, root, options);
      if (include.length === 0 && entries === undefined) return undefined;
      return { optimizeDeps: { include, ...(entries === undefined ? {} : { entries }) } };
    },
    configResolved(config) {
      if (warned.has(config.root)) return;
      warned.add(config.root);
      const copies = coreCopies(config.root);
      if (copies.length > 1) config.logger.warn(twoCopies(config.root, copies));
    },
  };
}

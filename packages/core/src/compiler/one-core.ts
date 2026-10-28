// One copy of core per app (gyral-k97.2, docs/references/consumer-setup.md "One copy of
// core"). A value one copy makes fails in another (a stylesheet is branded with its copy's
// symbol, a store lives in its copy's registry), far from the cause, so an app and the
// libraries it installs must share one. A second copy comes from one of two places, and
// gyralVitePreset covers both:
// - The dev server (and Vitest) pre-bundles dependencies. A package it meets partway through
//   a run is bundled again, with a copy of core of its own, and Vitest reports a reload. The
//   preset pre-bundles Gyral's installed browser entry points up front, together.
// - The package manager installed two (a library pinned to another version, or pnpm resolving
//   other peers for it). The preset reads the installed manifests, and warns once per app, in
//   dev and builds, when @gyral/core resolves to more than one folder.
// In development browsers, core itself warns when a page runs a second copy (view/message.ts).
// Node built-ins only, so ../vite.ts loads it with Node's require, from TypeScript source too
// (which is why it repeats scope.ts's package lookup instead of importing it).
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

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

/** The preset's plugin: pre-bundles Gyral's browser entries in dev, warns about a second copy. */
export function oneCorePlugin(): Plugin {
  return {
    name: 'gyral:one-core',
    config(config, env) {
      if (env.command !== 'serve') return undefined;
      const root = resolve(config.root ?? process.cwd());
      const listed = new Set(config.optimizeDeps?.include);
      const excluded = config.optimizeDeps?.exclude ?? [];
      const include = browserEntries(root).filter(
        (entry) =>
          !listed.has(entry) && !excluded.some((x) => entry === x || entry.startsWith(`${x}/`)),
      );
      return include.length === 0 ? undefined : { optimizeDeps: { include } };
    },
    configResolved(config) {
      if (warned.has(config.root)) return;
      warned.add(config.root);
      const copies = coreCopies(config.root);
      if (copies.length > 1) config.logger.warn(twoCopies(config.root, copies));
    },
  };
}

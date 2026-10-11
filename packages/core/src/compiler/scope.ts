// Which modules the build-time feature scan reads (features.ts, view/05-element.md "Features
// register themselves"): only those that can affect Gyral components. A module outside
// node_modules (the app's own source, a workspace or `link:` package) always can. An installed
// package can only if it is a Gyral package or depends on one, directly or through its own
// dependencies (a design system, a component library): a package that never reaches
// `@gyral/*` can't import `define`, `html` or `raw`, so it can't define a component, render a
// template or set a spec field (effect, three and the like). The manifests are read from disk
// the way Node finds packages (no exports map), once per build.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Gyral's packages (vite.ts has the same pattern for the dev server's dependents). */
const GYRAL_PACKAGES = /^@gyral\//;
/** The last `node_modules` directory in a path, and what follows it. */
const IN_NODE_MODULES = /^(.*[\\/]node_modules[\\/])((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;

interface Manifest {
  readonly name?: unknown;
  readonly dependencies?: object;
  readonly peerDependencies?: object;
  readonly optionalDependencies?: object;
}

function read(file: string): Manifest | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The installed package `name` as seen from `dir` (Node's lookup), as a real path. */
function locate(dir: string, name: string): string | undefined {
  for (let d = dir; ; d = dirname(d)) {
    const candidate = join(d, 'node_modules', name);
    if (read(join(candidate, 'package.json')) !== undefined) {
      try {
        return realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    if (dirname(d) === d) return undefined;
  }
}

const dependencyNames = (m: Manifest): string[] =>
  Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies });

export interface Scope {
  /** Whether module `id` can affect Gyral components, so the scan must read it. */
  inScope(id: string): boolean;
  /** The name of the package module `id` belongs to (`@gyral/core` is where `raw` comes from). */
  packageOf(id: string): string | undefined;
}

/** A scope for one build: manifests and answers are cached per package directory. */
export function createScope(): Scope {
  const reaches = new Map<string, boolean>();
  const names = new Map<string, string | undefined>();

  /** Whether the package in `dir`, or any package it depends on, is a Gyral package. */
  function reachesGyral(dir: string): boolean {
    const known = reaches.get(dir);
    if (known !== undefined) return known;
    // A walk of the dependency graph from `dir` (cycles are fine: each package is read once).
    const seen = new Set([dir]);
    const queue = [dir];
    let found = false;
    for (let next = queue.pop(); next !== undefined && !found; next = queue.pop()) {
      const m = read(join(next, 'package.json'));
      if (m === undefined) {
        found = next === dir; // the module's own package can't be read: scan it
        continue;
      }
      const deps = dependencyNames(m);
      if (
        (typeof m.name === 'string' && GYRAL_PACKAGES.test(m.name)) ||
        deps.some((d) => GYRAL_PACKAGES.test(d))
      ) {
        found = true;
        break;
      }
      for (const d of deps) {
        const at = locate(next, d);
        if (at === undefined || seen.has(at)) continue;
        if (reaches.get(at) === true) {
          found = true;
          break;
        }
        seen.add(at);
        queue.push(at);
      }
    }
    // Not found: the whole graph from `dir` was read, and no package in it reaches Gyral.
    if (!found) for (const s of seen) reaches.set(s, false);
    reaches.set(dir, found);
    return found;
  }

  /** The `name` of the nearest package.json above `file` that has one. */
  function nameAbove(file: string): string | undefined {
    const dir = dirname(file);
    if (names.has(dir)) return names.get(dir);
    const name = read(join(dir, 'package.json'))?.name;
    const result =
      typeof name === 'string' ? name : dirname(dir) === dir ? undefined : nameAbove(dir);
    names.set(dir, result);
    return result;
  }

  return {
    inScope(id) {
      const installed = IN_NODE_MODULES.exec(id);
      if (installed === null) return true;
      const dir = (installed[1] ?? '') + (installed[2] ?? '');
      let real = dir;
      try {
        real = realpathSync(dir);
      } catch {
        // keep the path as given
      }
      return reachesGyral(real);
    },
    packageOf(id) {
      const installed = IN_NODE_MODULES.exec(id);
      return installed === null ? nameAbove(id) : installed[2]?.replace(/\\/g, '/');
    },
  };
}

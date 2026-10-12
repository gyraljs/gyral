// What the target project has installed, read from its package.json, so scaffolds import only
// packages the project can resolve.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The packages a scaffold may import. `known: false` means no package.json could be read. */
export interface Installed {
  readonly known: boolean;
  /** Package name → version range as written (`^4.1.0`), for the packages we know about. */
  readonly packages: ReadonlyMap<string, string>;
  /** Where the information came from: a package.json path, or `the installed list`. */
  readonly source: string;
}

export const UNKNOWN: Installed = { known: false, packages: new Map(), source: 'nothing' };

const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** The nearest package.json at or above `dir`, or undefined. */
function findPackageJson(dir: string): string | undefined {
  for (let current = resolve(dir); ; current = dirname(current)) {
    const file = join(current, 'package.json');
    if (existsSync(file)) return file;
    if (dirname(current) === current) return undefined;
  }
}

/** Reads the dependencies of the project at (or above) `dir`; UNKNOWN when there is none. */
export function readInstalled(dir: string): Installed {
  const file = findPackageJson(dir);
  if (file === undefined) return UNKNOWN;
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const packages = new Map<string, string>();
    for (const field of FIELDS) {
      const deps = json[field];
      if (typeof deps !== 'object' || deps === null) continue;
      for (const [name, range] of Object.entries(deps)) {
        if (!packages.has(name)) packages.set(name, typeof range === 'string' ? range : '');
      }
    }
    // The package itself counts: scaffolding inside @gyral/core's own repo, say.
    if (typeof json['name'] === 'string') packages.set(json['name'], '');
    return { known: true, packages, source: file };
  } catch {
    return UNKNOWN;
  }
}

/** An explicit list of package names (`["@gyral/core", "valibot@1"]`), merged over `base`. */
export function withListed(base: Installed, listed: readonly string[] | undefined): Installed {
  if (listed === undefined) return base;
  const packages = new Map(base.packages);
  for (const entry of listed) {
    const at = entry.lastIndexOf('@');
    const name = at > 0 ? entry.slice(0, at) : entry;
    const range = at > 0 ? entry.slice(at + 1) : '';
    if (name.trim() !== '') packages.set(name.trim(), range);
  }
  return {
    known: true,
    packages,
    source: base.known ? `${base.source} and the installed list` : 'the installed list',
  };
}

export const has = (installed: Installed, name: string): boolean => installed.packages.has(name);

/** The major version a range names (`^4.1.0` → 4), or undefined (`workspace:*`, `latest`). */
export function major(installed: Installed, name: string): number | undefined {
  const match = /(\d+)/.exec(installed.packages.get(name) ?? '');
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

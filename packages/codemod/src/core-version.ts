/// <reference types="node" />
// The @gyral/core a module runs with (gyral-w2j). A release's transforms rewrite the API of the
// release they migrate from (0.3.8's turn 0.3.7's `gyralVitePreset()` into `gyral()`), so a
// package whose core is older than that is left as is: it must first be migrated that far. The
// package is the module's nearest package.json; its core is the one Node finds from there
// (installed), else the lowest version its declared range allows; unknown otherwise.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** A package's @gyral/core: the version, and where it was read. */
export interface CoreVersion {
  /** The installed version, or the declared range when nothing is installed. */
  readonly version: string;
  /** The lowest version it can be, `[major, minor, patch]`. */
  readonly lowest: readonly number[];
  /** The package's manifest, absolute. */
  readonly manifest: string;
  readonly installed: boolean;
}

type Manifest = Readonly<Record<string, unknown>>;

function read(file: string): Manifest | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof value === 'object' && value !== null ? (value as Manifest) : undefined;
  } catch {
    return undefined;
  }
}

/** The first `x.y.z` in a version or range: the version, or the lowest a range allows. */
function lowestOf(spec: string): readonly number[] | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(spec);
  return match === null ? undefined : match.slice(1).map(Number);
}

function declared(manifest: Manifest): string | undefined {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = manifest[field];
    const spec =
      typeof deps === 'object' && deps !== null ? (deps as Manifest)['@gyral/core'] : undefined;
    if (typeof spec === 'string') return spec;
  }
  return undefined;
}

/** The version of the @gyral/core Node resolves from `dir`, if any. */
function installedFrom(dir: string): string | undefined {
  for (let d = dir; ; d = dirname(d)) {
    const version = read(join(d, 'node_modules', '@gyral', 'core', 'package.json'))?.version;
    if (typeof version === 'string') return version;
    if (dirname(d) === d) return undefined;
  }
}

/** The package's core read from the manifest in `dir`. */
function coreOf(dir: string, manifest: Manifest): CoreVersion | undefined {
  const file = join(dir, 'package.json');
  const installed = installedFrom(dir);
  const version = installed ?? declared(manifest);
  const lowest = version === undefined ? undefined : lowestOf(version);
  if (version === undefined || lowest === undefined) return undefined;
  return { version, lowest, manifest: file, installed: installed !== undefined };
}

/** Each module's package core, cached by folder for a run. */
export function coreVersions(): (file: string) => CoreVersion | undefined {
  const byDir = new Map<string, CoreVersion | undefined>();
  const lookup = (dir: string): CoreVersion | undefined => {
    if (byDir.has(dir)) return byDir.get(dir);
    const manifest = read(join(dir, 'package.json'));
    const parent = dirname(dir);
    const found =
      manifest !== undefined ? coreOf(dir, manifest) : parent === dir ? undefined : lookup(parent);
    byDir.set(dir, found);
    return found;
  };
  return (file) => lookup(dirname(file));
}

/** Whether `core` is older than `version` (`x.y.z`). */
export function olderThan(core: CoreVersion, version: string): boolean {
  const target = lowestOf(version) ?? [];
  for (const [i, part] of core.lowest.entries()) {
    const other = target[i] ?? 0;
    if (part !== other) return part < other;
  }
  return false;
}

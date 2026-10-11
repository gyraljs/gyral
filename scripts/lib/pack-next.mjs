// The manifest rewrite of `pnpm pack:next` (../pack-next.mjs): pure, so it is unit-tested.

const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];

/**
 * The default prerelease for `version` (a workspace package's version): the next patch,
 * `-next.0`, so it sorts after the released `version` (0.3.0 → 0.3.1-next.0).
 */
export function defaultPrerelease(version) {
  const [major, minor, patch] = version.split('-')[0].split('.').map(Number);
  if (![major, minor, patch].every(Number.isInteger)) {
    throw new Error(`pack:next: can't derive a prerelease from version "${version}"`);
  }
  return `${major}.${minor}.${patch + 1}-next.0`;
}

const isGyral = (name) => name.startsWith('@gyral/') || name === 'create-gyral';

/**
 * The packed manifest at a prerelease `version`: every @gyral/* (and create-gyral) entry in
 * dependencies, peers, optional and dev dependencies points at that same prerelease (pnpm
 * rewrote `workspace:*` to the workspace's own version); other entries are kept as they are.
 */
export function prereleaseManifest(manifest, version) {
  const out = { ...manifest, version };
  for (const field of FIELDS) {
    const deps = manifest[field];
    if (deps === undefined) continue;
    out[field] = Object.fromEntries(
      Object.entries(deps).map(([name, range]) => [name, isGyral(name) ? version : range]),
    );
  }
  return out;
}

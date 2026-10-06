// Pure invariant checks. Each violation message tells an agent how to fix it.
// Wired into `pnpm invariants` by the scripts in ../check-*.mjs.

const EFFECT_IMPORT = /(?:from\s+|import\s*\(\s*)['"](effect|@effect\/[^'"]+|effect\/[^'"]+)['"]/g;

/** Public declaration files must not mention Effect: the public API is plain TypeScript. */
export function findEffectLeaks(file, text) {
  return [...text.matchAll(EFFECT_IMPORT)].map(
    (m) =>
      `${file}: public types reference "${m[1]}". Gyral's public API is plain TypeScript and ` +
      `Gyral has no Effect dependency (docs/design-docs/0015-runtime-size-spike.md). Convert ` +
      `the type to plain TypeScript (tagged unions, Promise, AbortSignal) before exporting it.`,
  );
}

/** Runtime dependencies @gyral/core may have (types-only packages). */
export const CORE_ALLOWED_DEPENDENCIES = ['@standard-schema/spec'];

/** @gyral/core's runtime peer dependencies: none since the view layer (ADR 0018). */
export const CORE_PEERS = [];
/**
 * Optional peers that only core's build-time tools load: `@gyral/core/vite` (parse5, vite;
 * view/01-templates.md "Compiled") and `@gyral/core/eslint` (eslint; view/09-template-rules.md).
 * Never imported by browser or server code, so they are no runtime dependency.
 */
export const CORE_BUILD_TIME_PEERS = ['eslint', 'parse5', 'vite'];

/**
 * Dependency rules (docs/design-docs/0015-runtime-size-spike.md): no package depends on
 * `effect`, and @gyral/core has no runtime dependency beyond the allowlist: its only peers are
 * optional build-time tools.
 */
export function checkDependencies(file, manifest) {
  const errors = [];
  const sections = ['dependencies', 'peerDependencies', 'optionalDependencies'];
  for (const section of sections) {
    for (const dep of Object.keys(manifest[section] ?? {})) {
      if (dep === 'effect' || dep.startsWith('@effect/')) {
        errors.push(
          `${file}: ${section} has "${dep}". Gyral has no Effect dependency since 0.2.0 ` +
            `(ADR 0015). Implement it in plain TypeScript, or put it in an optional adapter ` +
            `package such as @gyral/effect.`,
        );
      }
    }
  }
  if (manifest.name === '@gyral/core') {
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (!CORE_ALLOWED_DEPENDENCIES.includes(dep)) {
        errors.push(
          `${file}: @gyral/core must have no runtime dependencies ` +
            `(allowed: ${CORE_ALLOWED_DEPENDENCIES.join(', ')}). Remove "${dep}" or ` +
            `implement what you need inside packages/core/src/internal/.`,
        );
      }
    }
    for (const dep of Object.keys(manifest.peerDependencies ?? {})) {
      if (CORE_PEERS.includes(dep)) continue;
      if (!CORE_BUILD_TIME_PEERS.includes(dep)) {
        errors.push(
          `${file}: @gyral/core's only peers are the build-time-only ` +
            `${CORE_BUILD_TIME_PEERS.join(', ')}. Remove the "${dep}" peer, or, if only a ` +
            `build-time tool (@gyral/core/vite or @gyral/core/eslint) loads it, add it to ` +
            `CORE_BUILD_TIME_PEERS (scripts/lib/invariants.mjs) with a reason.`,
        );
      } else if (manifest.peerDependenciesMeta?.[dep]?.optional !== true) {
        errors.push(
          `${file}: the build-time peer "${dep}" must be optional ` +
            `(peerDependenciesMeta: { "${dep}": { "optional": true } }): apps that never ` +
            `use @gyral/core/vite or @gyral/core/eslint don't install it.`,
        );
      }
    }
  }
  return errors;
}

/** Top-level keys of the workflow's `on:` block. Handles block, inline and list forms. */
export function workflowTriggers(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^(on|"on"|'on'):/.test(l));
  if (start === -1) return [];
  const inline = lines[start].replace(/^[^:]+:/, '').trim();
  if (inline !== '') {
    return inline
      .replace(/[[\]]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const keys = [];
  let indent;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const width = line.length - line.trimStart().length;
    if (width === 0) break;
    indent ??= width;
    if (width !== indent) continue;
    const key = line.trim().replace(/^-\s*/, '').replace(/:.*$/, '');
    keys.push(key);
  }
  return keys;
}

/** Triggers each workflow may use (docs/design-docs/0004-local-ci.md). The repo is public, so
 * CI runs on GitHub for pushes and pull requests; everything else runs on demand only. */
const ALLOWED_TRIGGERS = {
  'ci.yml': ['workflow_dispatch', 'push', 'pull_request'],
};

/** Trigger policy for one workflow file. Messages say how to fix the violation. */
export function checkWorkflow(file, text) {
  const name = file.split('/').at(-1) ?? file;
  const allowed = ALLOWED_TRIGGERS[name] ?? ['workflow_dispatch'];
  const errors = workflowTriggers(text)
    .filter((t) => !allowed.includes(t))
    .map((t) =>
      t === 'pull_request_target'
        ? `${file}: "pull_request_target" runs untrusted pull request code with write access ` +
          `and secrets. Never use it (docs/design-docs/0004-local-ci.md).`
        : `${file}: trigger "${t}" is not allowed here. Only ci.yml runs on push/pull_request; ` +
          `every other workflow uses "workflow_dispatch" only (docs/design-docs/0004-local-ci.md).`,
    );
  if (name === 'ci.yml' && !/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(text)) {
    errors.push(
      `${file}: declare top-level "permissions:\n  contents: read" so pull request runs get a ` +
        `read-only token (docs/design-docs/0004-local-ci.md).`,
    );
  }
  if (name === 'release.yml' && !/^\s+environment:\s*npm\s*$/m.test(text)) {
    errors.push(
      `${file}: the publish job must use "environment: npm" so the owner approves every ` +
        `release (docs/references/releasing.md).`,
    );
  }
  return errors;
}

/** Relative markdown link targets (without anchors). */
export function relativeLinks(markdown) {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].split('#')[0])
    .filter((href) => href !== '' && !/^[a-z]+:/i.test(href));
}

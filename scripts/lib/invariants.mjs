// Pure invariant checks. Each violation message tells an agent how to fix it.
// Wired into `pnpm invariants` by the scripts in ../check-*.mjs.

const EFFECT_IMPORT = /(?:from\s+|import\s*\(\s*)['"](effect|@effect\/[^'"]+|effect\/[^'"]+)['"]/g;

/** Public declaration files must not mention Effect (docs/design-docs/0002-effect-boundary.md). */
export function findEffectLeaks(file, text) {
  return [...text.matchAll(EFFECT_IMPORT)].map(
    (m) =>
      `${file}: public types reference "${m[1]}". Effect must stay internal ` +
      `(docs/design-docs/0002-effect-boundary.md). Convert the type to plain TypeScript ` +
      `(tagged unions, Promise, AbortSignal) before exporting it.`,
  );
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

/** Workflows may only run on demand, locally via `gh act` (docs/design-docs/0004-local-ci.md). */
export function checkWorkflow(file, text) {
  return workflowTriggers(text)
    .filter((t) => t !== 'workflow_dispatch')
    .map(
      (t) =>
        `${file}: trigger "${t}" would run on GitHub-hosted runners and spend money. ` +
        `Use only "workflow_dispatch" and run it locally with "pnpm ci:local" ` +
        `(docs/design-docs/0004-local-ci.md).`,
    );
}

/** Relative markdown link targets (without anchors). */
export function relativeLinks(markdown) {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].split('#')[0])
    .filter((href) => href !== '' && !/^[a-z]+:/i.test(href));
}

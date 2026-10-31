// Core's production tree, dist/prod/ (gyral-gpr, ADR 0018 "Production build without development
// code"): every module a production app can load, with its development code stripped
// (strip-dev.mjs), at the same path under prod/ as in dist/. The publish manifest selects it:
// its exports map a runtime entry's `browser` condition without `development` to ./dist/prod/…,
// and its `#prod/<name>` subpath imports are the production twins of `#<name>`.
// The tree is self-contained: its modules import only each other and `#prod/` names, so no
// resolver, whatever conditions it applies to subpath imports, can mix the two trees.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { importsOf, stripDevelopment } from './strip-dev.mjs';

const DIST = './dist/';
const PROD = './dist/prod/';
export const PROD_IMPORT = '#prod/';
/**
 * Modules that no entry imports but core's Vite plugin does, by path, next to the compiled
 * entry it resolves (compiler/features.ts REGISTRATION): spec-field feature registrations.
 */
const REGISTRATIONS = /^use-[\w-]+\.js$/;

/** Every target path in an exports or imports value. */
export function targets(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(targets);
}

/** The target an imports value gives a resolver with no condition but `default`. */
function defaultTarget(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return undefined;
  return defaultTarget(value.default);
}

/** `to` (a path inside the tree) as a specifier relative to the module at `from`. */
function relativeSpecifier(from, to) {
  const path = posix.relative(posix.dirname(from), to);
  return path.startsWith('.') ? path : `./${path}`;
}

/**
 * How a module at `file` (a path inside the tree) names `specifier` in the production tree:
 * `#name` becomes `#prod/name` when the manifest has that twin, else its default target (the
 * flags' production modules) as a relative path; anything else is unchanged.
 */
function prodSpecifier(imports, file, specifier) {
  if (!specifier.startsWith('#') || specifier.startsWith(PROD_IMPORT)) return undefined;
  const name = specifier.slice(1);
  if (`${PROD_IMPORT}${name}` in imports) return `${PROD_IMPORT}${name}`;
  const target = defaultTarget(imports[specifier]);
  if (target === undefined || !target.startsWith(DIST)) {
    throw new Error(`${file}: no production target for ${specifier}`);
  }
  return relativeSpecifier(file, target.slice(DIST.length));
}

/** The tree paths a production module's import of `specifier` reaches. */
function reached(imports, file, specifier) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return [posix.normalize(posix.join(posix.dirname(file), specifier))];
  }
  if (!specifier.startsWith(PROD_IMPORT)) return [];
  return targets(imports[specifier]).map((target) => {
    if (!target.startsWith(PROD)) throw new Error(`${specifier} leaves the production tree`);
    return target.slice(PROD.length);
  });
}

/**
 * Writes `<dir>/dist/prod/` from the full build in `<dir>/dist/`, for a package whose publish
 * manifest (`publish`, publishConfig applied) points at it; returns the paths written, or none
 * when it doesn't. Only modules reachable from the production entries are written.
 */
export async function buildProduction(dir, publish) {
  const imports = publish.imports ?? {};
  const entries = [...targets(publish.exports), ...targets(imports)].filter((t) =>
    t.startsWith(PROD),
  );
  if (entries.length === 0) return [];
  const dist = join(dir, 'dist');
  const registrations = readdirSync(dist).filter((name) => REGISTRATIONS.test(name));
  const queue = [...entries.map((t) => t.slice(PROD.length)), ...registrations];
  const written = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || written.has(file)) continue;
    const input = join(dist, file);
    if (!existsSync(input)) throw new Error(`the production tree needs ${file}, not built`);
    const { code } = await stripDevelopment(readFileSync(input, 'utf8'), {
      file,
      specifier: (s) => prodSpecifier(imports, file, s),
    });
    for (const specifier of importsOf(code, file)) {
      if (specifier.startsWith('#') && !specifier.startsWith(PROD_IMPORT)) {
        throw new Error(`${file}: production module imports ${specifier}`);
      }
      queue.push(...reached(imports, file, specifier));
    }
    const output = join(dist, 'prod', file);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, code);
    written.add(file);
  }
  return [...written].sort();
}

/**
 * The `#prod/<name>` twin a manifest needs for subpath import `#<name>` (or undefined for the
 * flags, which the production tree inlines): the same conditions without `development`, its
 * targets moved into ./dist/prod/.
 */
export function prodTwin(value) {
  if (typeof value === 'string')
    return value.startsWith(DIST) ? PROD + value.slice(DIST.length) : value;
  if (value === null || typeof value !== 'object') return value;
  const kept = Object.entries(value).filter(([condition]) => condition !== 'development');
  if (kept.length === 1 && kept[0][0] === 'default') return prodTwin(kept[0][1]);
  return Object.fromEntries(kept.map(([condition, target]) => [condition, prodTwin(target)]));
}

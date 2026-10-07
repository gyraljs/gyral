// Build-time feature detection (view/05-element.md "Features register themselves",
// gyral-c5d.11, gyral-c5d.12), loaded lazily by the plugin shells in ../vite.ts. Some optional
// machinery can't register itself from an API call, because apps reach it through plain data:
// spec fields (`viewTransition`, `renderOnFrame`, `states`) and markup (`data-intent-on`
// values, `raw()` content). In builds that leave that machinery out by default (the
// `gyral-compiled` condition, and `gyral-client-only` for the invoker fallback), the modules
// that can affect Gyral components are scanned, and a module that may use a feature gets one
// import added at its end: `virtual:gyral-use/<feature>`, a side-effect module that calls
// `register()` from core's `use-<feature>` module before any module that imports it runs. The
// registration modules are reached only this way, never from an entry, so a build that doesn't
// use a feature doesn't even load its code (Rolldown emits chunks for every import() it loads,
// tree-shaken or not).
//
// Which modules (scope.ts): the app's own source, and installed packages that are Gyral's or
// depend on one, directly or through their dependencies. What counts in them (facts.ts): names
// and strings in the module's AST, never comments, and `raw` only when it comes from
// `@gyral/core`. Both over-approximate, so the scan stays sound: a field or event can only be
// set by writing its name somewhere, in a module that can reach Gyral (a name built at run
// time, such as `{ ['sta' + 'tes']: … }`, or spec data written in a package that doesn't
// depend on Gyral, are the gaps; view/05 says what then degrades). A false positive only bundles a few hundred
// bytes that weren't needed. Core's own modules are skipped (they implement it); a module that
// doesn't parse is matched on its text, comments included.
import { join } from 'node:path';
import { langOf, type Node } from './ast.js';
import { factsOf, writes, type Feature } from './facts.js';
import { createScope, type Scope } from './scope.js';

export type { Feature } from './facts.js';

/** The text fallback, for a module that doesn't parse: the 0.3.1-next.0 scan. */
const TEXT_USES: Readonly<Record<Feature, RegExp>> = {
  invokers:
    /data-intent-on\s*=\s*\\?["']?(?:command\b|\$\{)|(["'`])command\1|\braw\b\s*(?:\(|as\b)/i,
  transitions: /\bviewTransition\b/,
  frame: /\brenderOnFrame\b/,
  states: /\bstates\b/,
};

/** Each feature's registration module in core (`src/<name>.ts`, published as `dist/<name>.js`). */
const REGISTRATION: Readonly<Record<Feature, string>> = {
  invokers: 'use-invokers',
  transitions: 'use-transitions',
  frame: 'use-frame-lane',
  states: 'use-states',
};

/**
 * Text a module must contain to use a feature (the plugins' transform filters list the same).
 * `invokers`: also any import or export, which may reach `raw`.
 */
export const FEATURE_HINTS: Readonly<Record<Feature, RegExp>> = {
  invokers: /data-intent-on|command|raw|import|export/i,
  transitions: /viewTransition/,
  frame: /renderOnFrame/,
  states: /states/,
};

const PREFIX = 'virtual:gyral-use/';
/** The package that exports `raw`. */
const CORE = '@gyral/core';
const RESOLVED = '\0gyral-use/';
const SCRIPT = /\.[cm]?[jt]sx?$/;
/** core's compiled entry, in its source tree or its published dist/: [, dir, extension]. */
const ENTRY_FILE = /[\\/](src|dist)[\\/]view[\\/]compiled\.(ts|js)$/;

/** A plugin context's `resolve`, as far as detection needs it. */
type Resolve = (source: string, importer: string) => Promise<{ readonly id: string } | null>;

/** What the scan needs from the transform hook's plugin context. */
export interface ScanContext {
  /** `this.parse` (Rolldown's parser, TypeScript included). */
  readonly parse: (code: string, lang: ReturnType<typeof langOf>) => unknown;
  readonly resolve: Resolve;
}

export interface FeatureHooks {
  /** Finds the core copy the app imports (its compiled entry), to register with and to skip. */
  buildStart(resolve: Resolve, root: string): Promise<void>;
  resolveId(source: string): { id: string; moduleSideEffects: true } | null;
  load(id: string): string | null;
  /** The imports to append to module `id` for the features its `code` may use; '' for none. */
  inject(code: string, id: string, context: ScanContext): Promise<string>;
}

const importsOf = (features: readonly Feature[]): string =>
  features.map((feature) => `\nimport ${JSON.stringify(PREFIX + feature)};`).join('');

/**
 * Detection for `features`. `ownEntry`: the compiled entry of the core copy running the plugin,
 * used when the app's root can't resolve `@gyral/core/compiled` (fixtures, unusual layouts).
 */
export function createFeatures(features: readonly Feature[], ownEntry: string): FeatureHooks {
  let entry = ownEntry;
  let scope: Scope = createScope();
  const skipped = new Set([ownEntry.replace(ENTRY_FILE, '/')]);
  /** A registration module next to the compiled entry's view/ directory. */
  const moduleOf = (name: string): string =>
    entry.replace(ENTRY_FILE, (_, dir: string, ext: string) => `/${dir}/${name}.${ext}`);
  const isCore = (id: string): boolean => [...skipped].some((dir) => id.startsWith(dir));

  /**
   * Whether one of `specifiers`, imported by `importer`, is a module of core (where `raw` comes
   * from): `@gyral/core` or one of its subpaths, or a specifier that resolves into core (an
   * alias, a path). Another package that re-exports core's `raw` counts in its own module.
   */
  async function coreAmong(
    specifiers: readonly string[],
    importer: string,
    resolve: Resolve,
  ): Promise<boolean> {
    for (const specifier of specifiers) {
      if (specifier === CORE || specifier.startsWith(`${CORE}/`)) return true;
      let resolved: { readonly id: string } | null = null;
      try {
        resolved = await resolve(specifier, importer);
      } catch {
        // unresolvable: the bundler reports it
      }
      const id = resolved?.id.replace(/\?.*$/, '');
      if (id !== undefined && (isCore(id) || scope.packageOf(id) === CORE)) return true;
    }
    return false;
  }

  return {
    async buildStart(resolve, root) {
      scope = createScope(); // manifests may have changed since the last build (watch mode)
      const resolved = await resolve('@gyral/core/compiled', join(root, 'index.html'));
      if (resolved === null || !ENTRY_FILE.test(resolved.id)) return;
      entry = resolved.id;
      skipped.add(entry.replace(ENTRY_FILE, '/'));
    },
    resolveId(source) {
      if (!source.startsWith(PREFIX)) return null;
      const feature = source.slice(PREFIX.length) as Feature;
      return features.includes(feature)
        ? { id: RESOLVED + feature, moduleSideEffects: true }
        : null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      const file = moduleOf(REGISTRATION[id.slice(RESOLVED.length) as Feature]);
      return `import { register } from ${JSON.stringify(file)};\nregister();\n`;
    },
    async inject(code, id, context) {
      const file = id.replace(/\?.*$/, '');
      if (id.startsWith('\0') || !SCRIPT.test(file) || isCore(file)) return '';
      const hinted = features.filter((feature) => FEATURE_HINTS[feature].test(code));
      if (hinted.length === 0 || !scope.inScope(file)) return '';
      let program: Node;
      try {
        program = context.parse(code, langOf(file)) as Node;
      } catch {
        return importsOf(hinted.filter((feature) => TEXT_USES[feature].test(code)));
      }
      const facts = factsOf(program);
      const used: Feature[] = [];
      for (const feature of hinted) {
        if (
          writes(facts, feature) ||
          (feature === 'invokers' && (await coreAmong(facts.rawSources, id, context.resolve)))
        )
          used.push(feature);
      }
      return importsOf(used);
    },
  };
}

// Build-time feature detection (view/05-element.md "Features register themselves",
// gyral-c5d.11, gyral-c5d.12), loaded lazily by the plugin shells in ../vite.ts. Some optional
// machinery can't register itself from an API call, because apps reach it through plain data:
// spec fields (`viewTransition`, `renderOnFrame`, `states`) and markup (`data-intent-on`
// values). In builds that leave that machinery out by default (the `gyral-compiled` condition,
// and `gyral-client-only` for the invoker fallback), every module the build transforms is
// scanned, dependencies in node_modules included, and a module that may use a feature gets one
// import added at its end: `virtual:gyral-use/<feature>`, a side-effect module that calls
// `register()` from core's `use-<feature>` module before any module that imports it runs. The
// registration modules are reached only this way, never from an entry, so a build that doesn't
// use a feature doesn't even load its code (Rolldown emits chunks for every import() it loads,
// tree-shaken or not).
//
// The scan is a sound over-approximation on the source text: a field or event can only be set
// by writing its name somewhere, so a module that never names it can't use it (a name built at
// run time, such as `{ ['sta' + 'tes']: … }`, is the one gap; view/05 says what then degrades).
// Comments, strings and unrelated uses of the words count too: a false positive only bundles a
// few hundred bytes that weren't needed. Core's own modules are skipped (they implement it).
import { join } from 'node:path';

/** Optional machinery the build adds when a module may use it. */
export type Feature = 'invokers' | 'transitions' | 'frame' | 'states';

/**
 * What makes a module count as using a feature. `invokers`: something that can make a root
 * listen for `command` events (view/05 "Intent events"): a static `data-intent-on="command"`,
 * a bound `data-intent-on` (it listens for every intent event), a quoted "command" (`events:
 * ['command']`, a `setAttribute`), or a `raw()` call (its markup is read at run time).
 */
const USES: Readonly<Record<Feature, RegExp>> = {
  invokers:
    /data-intent-on\s*=\s*\\?["']?(?:command\b|\$\{)|(["'`])command\1|\braw\b\s*(?:\(|as\b)/,
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

/** A text filter for the transform hook: modules matching none of these use no feature. */
export const FEATURE_HINTS: Readonly<Record<Feature, RegExp>> = {
  invokers: /data-intent-on|command|raw/,
  transitions: /viewTransition/,
  frame: /renderOnFrame/,
  states: /states/,
};

const PREFIX = 'virtual:gyral-use/';
const RESOLVED = '\0gyral-use/';
const SCRIPT = /\.[cm]?[jt]sx?$/;
/** core's compiled entry, in its source tree or its published dist/: [, dir, extension]. */
const ENTRY_FILE = /[\\/](src|dist)[\\/]view[\\/]compiled\.(ts|js)$/;

/** A plugin context's `resolve`, as far as detection needs it. */
type Resolve = (source: string, importer: string) => Promise<{ readonly id: string } | null>;

export interface FeatureHooks {
  /** Finds the core copy the app imports (its compiled entry), to register with and to skip. */
  buildStart(resolve: Resolve, root: string): Promise<void>;
  resolveId(source: string): { id: string; moduleSideEffects: true } | null;
  load(id: string): string | null;
  /** The imports to append to module `id` for the features its `code` may use; '' for none. */
  inject(code: string, id: string): string;
}

/**
 * Detection for `features`. `ownEntry`: the compiled entry of the core copy running the plugin,
 * used when the app's root can't resolve `@gyral/core/compiled` (fixtures, unusual layouts).
 */
export function createFeatures(features: readonly Feature[], ownEntry: string): FeatureHooks {
  let entry = ownEntry;
  const skipped = new Set([ownEntry.replace(ENTRY_FILE, '/')]);
  /** A registration module next to the compiled entry's view/ directory. */
  const moduleOf = (name: string): string =>
    entry.replace(ENTRY_FILE, (_, dir: string, ext: string) => `/${dir}/${name}.${ext}`);
  return {
    async buildStart(resolve, root) {
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
    inject(code, id) {
      if (id.startsWith('\0') || !SCRIPT.test(id.replace(/\?.*$/, ''))) return '';
      for (const dir of skipped) if (id.startsWith(dir)) return '';
      return features
        .filter((feature) => USES[feature].test(code))
        .map((feature) => `\nimport ${JSON.stringify(PREFIX + feature)};`)
        .join('');
    },
  };
}

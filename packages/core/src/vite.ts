// Vite / Vitest settings every Gyral app needs (gyral-a7r, docs/references/consumer-setup.md):
// the template compiler (view/01-templates.md "Compiled") and, in serve mode, development
// output from the dev server's SSR (view/06-server.md "Development markers"). Only Node
// built-ins are imported up front, so it loads from vite.config.ts and vitest.config.ts in any
// way: bundled with the config, by Node from source (type stripping), or by a Vite module
// runner. The compiler is a plugin applied in `vite build` only, so dev servers and test runs
// keep the runtime template path; its implementation (./compiler/) loads on the first build
// hook, with `require` (Node loads ES modules with it too): a module runner that loaded this
// file may be closed by then, and would reject a dynamic import(). Public: the preset,
// gyralTemplateCompiler and gyralClientOnly (docs/references/public-api-0.3.1.md); the other
// plugins and constants here are internal.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigEnv, EnvironmentOptions, Plugin } from 'vite';
import type { FeatureHooks } from './compiler/features.js';
import type { CompilerHooks } from './compiler/hooks.js';
import type { LocatorHooks } from './compiler/locate.js';

export interface TemplateCompilerOptions {
  /**
   * Module specifiers whose `html` (and `svg`) exports are the view layer's tags (default
   * `DEFAULT_TEMPLATE_SOURCES`). An import matches when its specifier is listed, or when it
   * resolves to the same module as a listed one; core's own view modules always match. A
   * source other than '@gyral/core' must also export `compiled` (and `compiledSvg` when it
   * exports `svg`).
   */
  readonly sources?: readonly string[];
  /**
   * Rule 7's extra check with parse5 (an optional peer dependency): `true` (default) uses
   * 'parse5' when it is installed, a string names the module to load, `false` skips it.
   */
  readonly parse5?: boolean | string;
}

/** Where the view layer's `html` comes from: core's main entry (ADR 0018, Phase 3). */
const DEFAULT_TEMPLATE_SOURCES: readonly string[] = ['@gyral/core'];

/** The resolve condition that maps core's `#prepare` to its stub (ADR 0017's mechanism). */
const COMPILED_CONDITION = 'gyral-compiled';
/** The client's resolve condition in client-only builds (view/07 "Client-only builds"). */
const CLIENT_ONLY_CONDITION = 'gyral-client-only';
/** Vite 8's default resolve conditions (`defaultClientConditions`, server ones without browser). */
const CLIENT_CONDITIONS: readonly string[] = ['module', 'browser', 'development|production'];
const SERVER_CONDITIONS: readonly string[] = ['module', 'node', 'development|production'];

/**
 * Adds `condition` (default `gyral-compiled`) to an environment, on top of the app's
 * conditions or Vite's defaults: Vite replaces the defaults when a config names any condition.
 * `clientOnly`: only to environments that build for the browser.
 */
function addCondition(
  name: string,
  config: EnvironmentOptions,
  env: ConfigEnv & { isSsrTargetWebworker?: boolean },
  condition = COMPILED_CONDITION,
  clientOnly = false,
): void {
  const consumer = config.consumer ?? (name === 'client' ? 'client' : 'server');
  const client = consumer === 'client' || env.isSsrTargetWebworker === true;
  if (clientOnly && consumer !== 'client') return;
  const current = config.resolve?.conditions ?? (client ? CLIENT_CONDITIONS : SERVER_CONDITIONS);
  if (!current.includes(condition)) {
    config.resolve = { ...config.resolve, conditions: [...current, condition] };
  }
}

/** The compiled entry of this copy of core, next to this module. */
const OWN_COMPILED = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './view/compiled.ts' : './view/compiled.js',
    import.meta.url,
  ),
);

/** The settings both plugins pass to their lazily loaded implementation. */
function settingsOf(options: TemplateCompilerOptions) {
  return {
    sources: options.sources ?? DEFAULT_TEMPLATE_SOURCES,
    parse5:
      options.parse5 === false
        ? undefined
        : typeof options.parse5 === 'string'
          ? options.parse5
          : 'parse5',
  };
}

/**
 * A module of ./compiler/. From core's TypeScript source (this workspace, `link:` checkouts) it
 * loads through Vite's module runner, as a vite.config.ts would; from the published package,
 * with require.
 */
async function loadCompiler<M>(name: string): Promise<M> {
  const require = createRequire(import.meta.url);
  if (!import.meta.url.endsWith('.ts')) return require(`./compiler/${name}.js`) as M;
  const { runnerImport } = require('vite') as typeof import('vite');
  const nodeEnv = process.env['NODE_ENV']; // the runner sets it when unset; the build owns it
  const { module } = await runnerImport<M>(
    fileURLToPath(new URL(`./compiler/${name}.ts`, import.meta.url)),
    { configFile: false, logLevel: 'silent' },
  );
  if (nodeEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = nodeEnv;
  return module;
}

/** The compiler's hooks (`vite build`). */
async function loadHooks(options: TemplateCompilerOptions): Promise<CompilerHooks> {
  const hooks = await loadCompiler<typeof import('./compiler/hooks.js')>('hooks');
  return hooks.createCompiler({ ...settingsOf(options), ownEntry: OWN_COMPILED });
}

/** The template compiler alone (`gyralVitePreset()` includes it). */
export function gyralTemplateCompiler(options: TemplateCompilerOptions = {}): Plugin {
  let hooks: CompilerHooks | undefined;
  const ready = (): CompilerHooks => {
    if (hooks === undefined) throw new Error('gyral: the template compiler is not loaded yet');
    return hooks;
  };
  return {
    name: 'gyral:template-compiler',
    enforce: 'pre',
    apply: 'build',
    configEnvironment: addCondition,
    async configResolved(config) {
      hooks = await loadHooks(options);
      await hooks.configResolved.call(this, config);
    },
    buildStart(input) {
      return ready().buildStart.call(this, input);
    },
    // The registration modules of spec-field features (./compiler/features.ts).
    resolveId(source, importer, opts) {
      return ready().resolveId.call(this, source, importer, opts);
    },
    load(id, opts) {
      return ready().load.call(this, id, opts);
    },
    transform: {
      // Modules naming a template tag (html or svg; core's template module names both), or a
      // spec field whose machinery the build adds only when named (view/05).
      filter: {
        id: /\.[cm]?[jt]sx?$/,
        code: /html|svg|viewTransition|renderOnFrame|states|\.value\s*\(/,
      },
      handler(code, id, opts) {
        return ready().transform.call(this, code, id, opts);
      },
    },
    generateBundle(output, bundle, isWrite) {
      return ready().generateBundle.call(this, output, bundle, isWrite);
    },
  };
}

/**
 * Development source locations (view/01-templates.md "Source locations"): in `vite serve` (the
 * dev server, Vitest) each html`…` and svg`…` call site of the template sources tells the
 * runtime where it was written, so template rule errors and hydration mismatches name
 * `file:line:col` (./compiler/locate.ts, loaded on the first hook). `vite build` compiles
 * templates instead.
 */
function gyralTemplateLocations(options: TemplateCompilerOptions = {}): Plugin {
  let hooks: LocatorHooks | undefined;
  const ready = (): LocatorHooks => {
    if (hooks === undefined) throw new Error('gyral: the template locator is not loaded yet');
    return hooks;
  };
  return {
    name: 'gyral:template-locations',
    enforce: 'pre',
    apply: 'serve',
    async configResolved(config) {
      const locate = await loadCompiler<typeof import('./compiler/locate.js')>('locate');
      hooks = locate.createLocator(settingsOf(options).sources);
      await hooks.configResolved.call(this, config);
    },
    transform: {
      // Modules naming a template tag (html or svg), as the compiler's filter.
      filter: { id: /\.[cm]?[jt]sx?$/, code: /html|svg/ },
      handler(code, id, opts) {
        return ready().transform.call(this, code, id, opts);
      },
    },
  };
}

/**
 * Gyral's packages: the dev server runs them through Vite, never Node (view/06). The feature
 * scan's scope (./compiler/scope.ts) uses the same pattern.
 */
const GYRAL_PACKAGES = /^@gyral\//;

type Manifest = Partial<Record<'dependencies' | 'devDependencies' | 'peerDependencies', object>>;

function manifest(file: string): Manifest | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  } catch {
    return undefined;
  }
}

/** The installed manifest of `name`, looked up from `root` the way Node does (no exports map). */
function installed(root: string, name: string): Manifest | undefined {
  for (let dir = root; ; dir = dirname(dir)) {
    const found = manifest(join(dir, 'node_modules', name, 'package.json'));
    if (found !== undefined || dirname(dir) === dir) return found;
  }
}

/**
 * The app's direct dependencies that depend on a Gyral package (a design system, say). They
 * import `@gyral/core`, so they must share the copy the dev server runs.
 */
function gyralDependents(root: string): string[] {
  const app = manifest(join(root, 'package.json'));
  const names = Object.keys({ ...app?.dependencies, ...app?.devDependencies });
  return names.filter((name) => {
    if (GYRAL_PACKAGES.test(name)) return false;
    const dep = installed(root, name);
    return Object.keys({ ...dep?.dependencies, ...dep?.peerDependencies }).some((d) =>
      GYRAL_PACKAGES.test(d),
    );
  });
}

/**
 * Development output from the dev server's SSR (`ssrLoadModule`, view/06 "Development
 * markers"). Vite externalizes installed packages there and Node imports them itself, resolving
 * core's `#view-dev` without the `development` condition (Vite's `externalConditions` only pick
 * the entry file, not the package's own imports), so the server rendered production output.
 * In serve mode this plugin keeps Gyral's packages, and the app's dependencies that use them,
 * out of externalization in server environments: Vite resolves them with its conditions
 * (`development` in dev), and they all share one copy of core. `vite build` is unaffected.
 */
function gyralDevServer(): Plugin {
  let root = process.cwd();
  return {
    name: 'gyral:dev-server',
    apply: 'serve',
    config(config) {
      root = resolve(config.root ?? process.cwd());
    },
    configEnvironment(name, config) {
      const consumer = config.consumer ?? (name === 'client' ? 'client' : 'server');
      if (consumer === 'client') return undefined;
      return { resolve: { noExternal: [GYRAL_PACKAGES, ...gyralDependents(root)] } };
    },
  };
}

/**
 * Client-only builds (view/07-hydration.md "Client-only builds", gyral-c5d.11), for apps no
 * server renders: the browser environment resolves core with the `gyral-client-only`
 * condition, so the bundle carries no hydration code (no seed reading, no hydration chunk and
 * its import()), and in `vite build` the invoker-command fallback only when a module that can
 * affect Gyral components (the app's own, or a package that reaches a Gyral package) may use
 * command intents (./compiler/features.ts). With no other import(), Vite's preload helper goes
 * too. Server-rendered markup met anyway renders fresh (development warns). Dev servers and
 * test runs get the condition too, and always keep the invoker fallback.
 */
export function gyralClientOnly(): Plugin {
  let hooks: FeatureHooks | undefined;
  let root = process.cwd();
  return {
    name: 'gyral:client-only',
    enforce: 'pre',
    configEnvironment(name, config, env) {
      addCondition(name, config, env, CLIENT_ONLY_CONDITION, true);
    },
    async configResolved(config) {
      root = config.root;
      if (config.command !== 'build') return;
      const features = await loadCompiler<typeof import('./compiler/features.js')>('features');
      hooks = features.createFeatures(['invokers'], OWN_COMPILED);
    },
    async buildStart() {
      await hooks?.buildStart((source, importer) => this.resolve(source, importer), root);
    },
    resolveId(source) {
      return hooks?.resolveId(source) ?? null;
    },
    load(id) {
      return hooks?.load(id) ?? null;
    },
    transform: {
      // features.ts FEATURE_HINTS.invokers: any import or export may reach `raw`.
      filter: { id: /\.[cm]?[jt]sx?$/, code: /data-intent-on|command|raw|import|export/i },
      async handler(code, id) {
        if (hooks === undefined || this.environment.config.consumer !== 'client') return null;
        const imports = await hooks.inject(code, id, {
          parse: (text, lang) => this.parse(text, { lang }),
          resolve: (source, importer) => this.resolve(source, importer),
        });
        // Appended after the last line: no code moves, so the incoming source map holds.
        return imports === '' ? null : { code: code + imports, map: null };
      },
    },
  };
}

export interface GyralViteOptions {
  /** Modules to pre-bundle in dev, so Vite doesn't discover them mid-run and reload. */
  readonly optimize?: readonly string[];
  /** Template compiler options (`vite build` only). */
  readonly compiler?: TemplateCompilerOptions;
  /**
   * The app is never server-rendered: leave the hydration code out of the browser bundle
   * (`gyralClientOnly()`, view/07-hydration.md "Client-only builds"). Default false.
   */
  readonly clientOnly?: boolean;
}

export interface GyralViteConfig {
  readonly plugins: Plugin[];
  readonly optimizeDeps: { readonly include: string[] };
}

/**
 * Spread into a Vite config, or into each Vitest project:
 *
 *   export default defineConfig({ ...gyralVitePreset(), build: { … } });
 *
 * With plugins of your own, list both: `plugins: [...preset.plugins, mine()]`.
 */
export function gyralVitePreset(options: GyralViteOptions = {}): GyralViteConfig {
  return {
    plugins: [
      // Before the compiler: its feature scan reads the author's templates, not compiled ones.
      ...(options.clientOnly === true ? [gyralClientOnly()] : []),
      gyralTemplateCompiler(options.compiler),
      gyralTemplateLocations(options.compiler),
      gyralDevServer(),
    ],
    optimizeDeps: { include: [...new Set(options.optimize ?? [])] },
  };
}

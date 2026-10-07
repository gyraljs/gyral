// Vite / Vitest settings every Gyral app needs (gyral-a7r, docs/references/consumer-setup.md):
// the template compiler (view/01-templates.md "Compiled") and, in serve mode, development
// output from the dev server's SSR (view/06-server.md "Development markers"). Only Node
// built-ins are imported up front, so it loads from vite.config.ts and vitest.config.ts in any
// way: bundled with the config, by Node from source (type stripping), or by a Vite module
// runner. The compiler is a plugin applied in `vite build` only, so dev servers and test runs
// keep the runtime template path; its implementation (./compiler/) loads on the first build
// hook, with `require` (Node loads ES modules with it too): a module runner that loaded this
// file may be closed by then, and would reject a dynamic import().
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigEnv, EnvironmentOptions, Plugin } from 'vite';
import type { CompilerHooks } from './compiler/hooks.js';

export interface TemplateCompilerOptions {
  /**
   * Module specifiers whose `html` export is the view layer's tag (default
   * `DEFAULT_TEMPLATE_SOURCES`). An import matches when its specifier is listed, or when it
   * resolves to the same module as a listed one; core's own view modules always match. A
   * source other than '@gyral/core' must also export `compiled`.
   */
  readonly sources?: readonly string[];
  /**
   * Rule 7's extra check with parse5 (an optional peer dependency): `true` (default) uses
   * 'parse5' when it is installed, a string names the module to load, `false` skips it.
   */
  readonly parse5?: boolean | string;
}

/** Where the view layer's `html` comes from: core's main entry (ADR 0018, Phase 3). */
export const DEFAULT_TEMPLATE_SOURCES: readonly string[] = ['@gyral/core'];

/** The resolve condition that maps core's `#prepare` to its stub (ADR 0017's mechanism). */
export const COMPILED_CONDITION = 'gyral-compiled';
/** Vite 8's default resolve conditions (`defaultClientConditions`, server ones without browser). */
export const CLIENT_CONDITIONS: readonly string[] = ['module', 'browser', 'development|production'];
export const SERVER_CONDITIONS: readonly string[] = ['module', 'node', 'development|production'];

/**
 * Adds the `gyral-compiled` condition to an environment, on top of the app's conditions or
 * Vite's defaults: Vite replaces the defaults when a config names any condition.
 */
function addCondition(
  name: string,
  config: EnvironmentOptions,
  env: ConfigEnv & { isSsrTargetWebworker?: boolean },
): void {
  const consumer = config.consumer ?? (name === 'client' ? 'client' : 'server');
  const client = consumer === 'client' || env.isSsrTargetWebworker === true;
  const current = config.resolve?.conditions ?? (client ? CLIENT_CONDITIONS : SERVER_CONDITIONS);
  if (!current.includes(COMPILED_CONDITION)) {
    config.resolve = { ...config.resolve, conditions: [...current, COMPILED_CONDITION] };
  }
}

/**
 * The compiler's hooks. From core's TypeScript source (this workspace, `link:` checkouts) they
 * load through Vite's module runner, as a vite.config.ts would; from the published package,
 * with require.
 */
async function loadHooks(options: TemplateCompilerOptions): Promise<CompilerHooks> {
  const settings = {
    sources: options.sources ?? DEFAULT_TEMPLATE_SOURCES,
    parse5:
      options.parse5 === false
        ? undefined
        : typeof options.parse5 === 'string'
          ? options.parse5
          : 'parse5',
  };
  const require = createRequire(import.meta.url);
  if (!import.meta.url.endsWith('.ts')) {
    return (require('./compiler/hooks.js') as typeof import('./compiler/hooks.js')).createCompiler(
      settings,
    );
  }
  const { runnerImport } = require('vite') as typeof import('vite');
  const nodeEnv = process.env['NODE_ENV']; // the runner sets it when unset; the build owns it
  const { module } = await runnerImport<typeof import('./compiler/hooks.js')>(
    fileURLToPath(new URL('./compiler/hooks.ts', import.meta.url)),
    { configFile: false, logLevel: 'silent' },
  );
  if (nodeEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = nodeEnv;
  return module.createCompiler(settings);
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
    transform: {
      filter: { id: /\.[cm]?[jt]sx?$/, code: 'html' },
      handler(code, id, opts) {
        return ready().transform.call(this, code, id, opts);
      },
    },
    generateBundle(output, bundle, isWrite) {
      return ready().generateBundle.call(this, output, bundle, isWrite);
    },
  };
}

/** Gyral's packages: the dev server runs them through Vite, never Node (view/06). */
export const GYRAL_PACKAGES = /^@gyral\//;

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
export function gyralDependents(root: string): string[] {
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
export function gyralDevServer(): Plugin {
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

export interface GyralViteOptions {
  /** Modules to pre-bundle in dev, so Vite doesn't discover them mid-run and reload. */
  readonly optimize?: readonly string[];
  /** Template compiler options (`vite build` only). */
  readonly compiler?: TemplateCompilerOptions;
}

export interface GyralViteConfig {
  readonly plugins: Plugin[];
  readonly resolve: { readonly dedupe: string[] };
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
    plugins: [gyralTemplateCompiler(options.compiler), gyralDevServer()],
    resolve: { dedupe: [] },
    optimizeDeps: { include: [...new Set(options.optimize ?? [])] },
  };
}

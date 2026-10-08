// Real server markup in Vitest browser-mode tests (gyral-dyn.8). A browser test can't run the
// server renderer: in the browser define() registers custom elements instead of recording server
// specs, and client builds drop the server segments of compiled templates. A browser command runs
// in Vitest's Node process instead (https://vitest.dev/api/browser/commands): it loads the
// module through the project's Vite server, in its SSR environment (Node conditions, the
// development condition in tests, Gyral packages not externalized: gyralVitePreset), renders
// with `@gyral/core/server` and returns the HTML for `mountSsr()`.
//
// Config side only: import it from vitest.config.ts, never from a test file.
import { dirname, isAbsolute, resolve } from 'node:path';
import type { BrowserCommand, BrowserCommandContext } from 'vitest/node';

/** What `renderOnServer` renders. Everything is sent from the browser, so it must be JSON. */
export interface ServerRenderRequest {
  /**
   * The module to load on the server: relative to the test file (`'../src/counter.ts'`), an
   * absolute path, a path from the project root (`'/src/app.ts'`) or a package specifier.
   */
  readonly module: string;
  /**
   * The export to render (default `'default'`):
   * - a `define()` class: renders its element, with `props` set as properties;
   * - a function: called with `props`; it may return (or resolve to) a template result, an
   *   HTML string or a `Response` (a full page from `@gyral/ssr`'s `renderPage`, an app's
   *   `fetch` handler…);
   * - a template result: rendered as is.
   */
  readonly export?: string;
  /** Props for a component class, or the argument of a function export. */
  readonly props?: Readonly<Record<string, unknown>>;
  /**
   * Development markers and checks (`render`'s `dev` option). Default: the build of core the
   * server loads (development in Vitest).
   */
  readonly dev?: boolean;
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Server-renders a module's export in Vitest's Node process and returns the HTML, for
     * `mountSsr()`. Register it in the config: `browser: { commands: { renderOnServer } }`
     * (from `@gyral/testing/vitest`).
     */
    renderOnServer: (request: ServerRenderRequest) => Promise<string>;
  }
}

/** The parts of `@gyral/core/server` this command uses. */
interface ServerModule {
  readonly renderToString: (value: unknown, options?: { readonly dev?: boolean }) => string;
}
/** The parts of `@gyral/core` this command uses. */
interface CoreModule {
  readonly html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
}

type Exports = Readonly<Record<string, unknown>>;
type Load = (id: string) => Promise<Exports>;

/** Imports a resolved module in the server environment (Vite's module runner). */
function loaderOf(context: BrowserCommandContext): {
  readonly load: Load;
  readonly resolveId: (spec: string, importer: string) => Promise<string>;
} {
  const server = context.project.vite;
  if (!('ssr' in server.environments)) {
    throw new Error('renderOnServer: the Vite server has no ssr environment');
  }
  const env = server.environments['ssr'];
  // A RunnableDevEnvironment (Vite's default ssr environment) has a module runner.
  const { runner } = env as { readonly runner?: { readonly import: Load } };
  return {
    // The runner when the environment has one (Vite's default), else Vite's ssrLoadModule.
    load: (id) => (runner === undefined ? server.ssrLoadModule(id) : runner.import(id)),
    resolveId: async (spec, importer) => {
      const resolved = await env.pluginContainer.resolveId(spec, importer);
      if (resolved === null) {
        throw new Error(`renderOnServer: can't resolve "${spec}" from ${importer}`);
      }
      return resolved.id;
    },
  };
}

const describeExports = (module: Exports): string => Object.keys(module).join(', ') || 'none';

/** A `define()` class outside the browser: it carries `spec` and `tagName`. */
const isComponentClass = (value: unknown): value is { readonly tagName: string } =>
  typeof value === 'function' &&
  'spec' in value &&
  'tagName' in value &&
  typeof value.tagName === 'string';

// One template per tag and prop names, like a template literal's call site.
const hostTemplates = new Map<string, TemplateStringsArray>();

/** `<tag .a=${…} .b=${…}></tag>`: the element with its props bound as properties. */
function hostTemplate(tag: string, names: readonly string[]): TemplateStringsArray {
  const key = `${tag} ${names.join(' ')}`;
  const cached = hostTemplates.get(key);
  if (cached !== undefined) return cached;
  const strings =
    names.length === 0
      ? [`<${tag}></${tag}>`]
      : [`<${tag} .${names[0] ?? ''}=`, ...names.slice(1).map((n) => ` .${n}=`), `></${tag}>`];
  const template = Object.freeze(Object.assign([...strings], { raw: Object.freeze(strings) }));
  hostTemplates.set(key, template);
  return template;
}

const isResponse = (value: unknown): value is Response =>
  typeof value === 'object' && value !== null && value instanceof Response;

/**
 * The browser command: `browser: { commands: { renderOnServer } }` in vitest.config.ts, then in
 * a browser test:
 *
 *   import { commands } from 'vitest/browser';
 *   const page = mountSsr(await commands.renderOnServer({ module: '../src/counter.ts',
 *     export: 'Counter', props: { start: 3 } }));
 *   await import('../src/counter.ts'); // hydrates in place
 *   await hydrated(page);
 */
export const renderOnServer: BrowserCommand<[ServerRenderRequest], string> = async (
  context,
  request,
) => {
  const importer = context.testPath ?? resolve(context.project.config.root, 'index.html');
  const { load, resolveId } = loaderOf(context);
  const spec =
    request.module.startsWith('.') && !isAbsolute(request.module)
      ? resolve(dirname(importer), request.module)
      : request.module;
  const id = await resolveId(spec, importer);
  // Core resolved from the module itself: the copy its components registered with.
  const [module, coreExports, serverExports] = await Promise.all([
    load(id),
    resolveId('@gyral/core', id).then(load),
    resolveId('@gyral/core/server', id).then(load),
  ]);
  // Sound: these are @gyral/core's own entry points.
  const core = coreExports as unknown as CoreModule;
  const server = serverExports as unknown as ServerModule;
  const name = request.export ?? 'default';
  if (!(name in module)) {
    throw new Error(
      `renderOnServer: ${request.module} has no export "${name}" (exports: ${describeExports(module)})`,
    );
  }
  const value = module[name];
  const props = request.props ?? {};
  let result: unknown;
  if (isComponentClass(value)) {
    const names = Object.keys(props);
    result = core.html(hostTemplate(value.tagName, names), ...names.map((n) => props[n]));
  } else if (typeof value === 'function') {
    result = await (value as (props: unknown) => unknown)(props);
  } else {
    result = value;
  }
  if (typeof result === 'string') return result;
  if (isResponse(result)) return result.text();
  return server.renderToString(result, request.dev === undefined ? {} : { dev: request.dev });
};

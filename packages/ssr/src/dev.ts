/// <reference types="node" />
// `gyralDevServer` (ADR 0016 addendum "Development server"): the development server every SSR
// app used to write by hand. Vite serves client modules in middleware mode; every other request
// is server-rendered by the app module, which Vite reloads after an edit (edits show at once),
// streamed through `toNodeListener`. The app is built once per module version and component
// set, not per request (gyral-337.12). `gyralDevMiddleware` is the same without the HTTP
// server, for an Express, Connect or Fastify app of its own. Exported from `@gyral/ssr/node`;
// Vite loads on first use.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { InlineConfig, ViteDevServer } from 'vite';
import type { ComponentAssets, ComponentModule } from './components.js';
import { toNodeListener, type NodeEnv } from './node.js';

/** What `gyralDevServer` hands the app factory with each freshly loaded module. */
export interface DevServerContext<S> {
  /**
   * For `renderPage({ components })` when the Vite config uses `gyral({ components })`:
   * the loader and the tags it knows. Undefined otherwise.
   */
  readonly components: ComponentAssets | undefined;
  /** The value `state` created once, kept across module reloads. */
  readonly state: S;
}

/** A request handler: a Hono app, `productionServer`'s result, or `{ fetch }`. */
export interface DevApp {
  readonly fetch: (request: Request, env: NodeEnv) => Response | Promise<Response>;
}

export interface DevMiddlewareOptions<M, S> {
  /** The server module, from Vite's root (e.g. `/server/app.ts`). Vite reloads it after an edit. */
  readonly entry: string;
  /**
   * Builds the request handler from the module just loaded: once per module version (Vite gives
   * a new module after an edit) and set of components, not per request. Keep per-request work
   * in the handler.
   */
  readonly app: (module: M, context: DevServerContext<S>) => DevApp;
  /**
   * State that must outlive module reloads (an in-memory database, say): created once, from the
   * first module loaded, and passed to every `app` call.
   */
  readonly state?: (module: M) => S;
  /** The HMR WebSocket's port, so several dev servers can run side by side. Default Vite's. */
  readonly hmrPort?: number;
  /** `toNodeListener`'s `origin`: the public origin when absolute URLs matter. */
  readonly origin?: string;
  /** More Vite settings (root, configFile, plugins, …), merged under the server settings. */
  readonly vite?: InlineConfig;
}

export interface DevServerOptions<M, S> extends DevMiddlewareOptions<M, S> {
  /** Default: the `PORT` environment variable, else 5173. `0` picks a free port. */
  readonly port?: number;
  /** Default: Node's (all interfaces). */
  readonly host?: string;
}

export interface DevMiddleware {
  /**
   * A Connect-style handler: Express and Connect take it with `app.use()`, Fastify through
   * `@fastify/middie`. It answers every request that reaches it (Vite's modules, then the app),
   * so mount the server's own routes before it.
   */
  readonly middleware: (req: IncomingMessage, res: ServerResponse) => void;
  readonly vite: ViteDevServer;
  /** Stops Vite. */
  readonly close: () => Promise<void>;
}

export interface DevServer {
  /** `http://host:port/` the server listens on. */
  readonly url: string;
  readonly server: Server;
  readonly vite: ViteDevServer;
  /** Stops the HTTP server and Vite. */
  readonly close: () => Promise<void>;
}

/** The preset's components plugin, as far as this module needs it (core/vite.ts). */
interface ComponentsPlugin {
  readonly name: string;
  readonly api?: { readonly tags?: () => ReadonlyMap<string, string> };
}

const NOTHING: ComponentModule = { preload: [], stylesheets: [] };

/** Development's component assets: Vite serves the loader; modules load from source. */
function devComponents(vite: ViteDevServer): (() => ComponentAssets) | undefined {
  const plugin = (vite.config.plugins as readonly ComponentsPlugin[]).find(
    (p) => p.name === 'gyral:components',
  );
  const tags = plugin?.api?.tags;
  if (tags === undefined) return undefined;
  return () => ({
    loader: '/@id/virtual:gyral/components',
    modules: new Map([...tags().keys()].map((tag) => [tag, NOTHING])),
    scripts: ['/@vite/client'],
  });
}

/** A JSON value safe inside `<script>`. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/** The 500 page of a render error: Vite's error overlay with the source-mapped stack. */
function errorPage(error: unknown): Response {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack ?? '' }
      : { message: String(error), stack: '' };
  const body = `<!doctype html><meta charset="utf-8"><title>Error</title>
<script type="module">
import { ErrorOverlay } from '/@vite/client';
document.body.append(new ErrorOverlay(${scriptJson(err)}));
</script>`;
  return new Response(body, {
    status: 500,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * The development server of a server-rendered app, as middleware for a server of its own:
 *
 *   const dev = await gyralDevMiddleware({ entry: '/server/app.ts', app: (mod) => mod.app });
 *   express().use('/api', api).use(dev.middleware).listen(5173);
 *
 * Client modules, CSS and HMR come from Vite (middleware mode); any other request renders
 * through the app, streamed. A render error answers 500 with Vite's error overlay.
 */
export async function gyralDevMiddleware<M, S = undefined>(
  options: DevMiddlewareOptions<M, S>,
): Promise<DevMiddleware> {
  const { createServer: createVite } = await import('vite');
  const viteOptions = options.vite ?? {};
  const vite = await createVite({
    ...viteOptions,
    appType: 'custom',
    server: {
      ...viteOptions.server,
      middlewareMode: true,
      ...(options.hmrPort === undefined ? {} : { ws: { port: options.hmrPort } }),
    },
  });
  const components = devComponents(vite);
  let shared: { readonly value: S } | undefined;
  let built: { readonly module: M; readonly tags: string; readonly app: DevApp } | undefined;
  const listener = toNodeListener(
    async (request, env) => {
      try {
        const module = (await vite.ssrLoadModule(options.entry)) as M;
        shared ??= {
          value: (options.state === undefined ? undefined : options.state(module)) as S,
        };
        const assets = components?.();
        const tags = assets === undefined ? '' : [...assets.modules.keys()].join(' ');
        if (built?.module !== module || built.tags !== tags) {
          const app = options.app(module, { components: assets, state: shared.value });
          built = { module, tags, app };
        }
        return await built.app.fetch(request, env);
      } catch (error) {
        if (error instanceof Error) vite.ssrFixStacktrace(error);
        console.error(error);
        return errorPage(error);
      }
    },
    options.origin === undefined ? {} : { origin: options.origin },
  );
  return {
    middleware: (req, res) => {
      vite.middlewares(req, res, () => {
        listener(req, res);
      });
    },
    vite,
    close: () => vite.close(),
  };
}

/**
 * Starts the development server of a server-rendered app:
 *
 *   await gyralDevServer({
 *     entry: '/server/app.ts',
 *     app: (mod: typeof import('./app.js'), { components }) => mod.createApp({ components }),
 *   });
 *
 * `gyralDevMiddleware` on its own HTTP server.
 */
export async function gyralDevServer<M, S = undefined>(
  options: DevServerOptions<M, S>,
): Promise<DevServer> {
  const dev = await gyralDevMiddleware(options);
  const server = createServer(dev.middleware);
  const port = options.port ?? Number(process.env['PORT'] ?? 5173);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const host = options.host ?? 'localhost';
  return {
    url: `http://${host}:${String(address.port)}/`,
    server,
    vite: dev.vite,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      });
      await dev.close();
    },
  };
}

// The SSR examples' dev servers re-load the app module on every request so server-rendered
// output follows source edits. State an app keeps in memory (registered emails, replies) must
// outlive that: devFetch creates it once per dev-server process, from the first module it
// loads, and hands it to every per-request app (gyral-abk).

/** Anything with a web-standard fetch handler, such as a Hono app. */
export interface FetchHandler {
  fetch(request: Request): Response | Promise<Response>;
}

/**
 * A request handler that loads the app module per request but creates its state once.
 * `load` re-imports the module (e.g. `vite.ssrLoadModule`), `state` makes the state from the
 * first module loaded, and `app` builds the per-request app around that state.
 */
export function devFetch<M, S>(
  load: () => Promise<M>,
  state: (mod: M) => S,
  app: (mod: M, state: S) => FetchHandler,
): (request: Request) => Promise<Response> {
  let shared: { readonly value: S } | undefined;
  return async (request) => {
    const mod = await load();
    shared ??= { value: state(mod) };
    return app(mod, shared.value).fetch(request);
  };
}

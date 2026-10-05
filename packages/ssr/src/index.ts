// Server rendering for Gyral (docs/design-docs/0012-ssr.md). Runtime-agnostic: returns web
// `Response`/`ReadableStream`, so Hono, Deno, Bun or a Service Worker can serve it.
import {
  defineStoresProvider,
  scriptSafeJson,
  STORE_SEED_ATTRIBUTE,
  StoreRegistry,
  warnJsonHazard,
  withStoreScope,
  type AnyStoreInstance,
} from '@gyral/core';
import { nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderChunks, serverHtml, type StepScope } from './internal/lit.js';

// <gyral-stores> must be a registered element before templates using it are prepared, so
// components rendered inside it find its instances and its state is seeded (ADR 0013).
defineStoresProvider();

export { serverHtml };
export { formAction, rejectWith, seeOther } from './forms.js';
export type { FormActionHandlers, FormReject } from './forms.js';

export interface RenderOptions {
  /**
   * This request's store instances (ADR 0013). Components read them during the render; a
   * store not listed starts from its `init`. Create new instances per request.
   */
  readonly stores?: readonly AnyStoreInstance[];
}

export interface PageOptions extends RenderOptions {
  readonly title: string;
  /** The hydratable app: a regular `lit` `html` template, usually one custom element. */
  readonly body: unknown;
  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
  readonly description?: string;
  /** Extra server-only head content, written with `serverHtml` (styles, links, meta). */
  readonly head?: unknown;
  /** Module scripts to load, e.g. the client entry that imports `@gyral/ssr/hydrate` first. */
  readonly scripts?: readonly string[];
}

/** The page-level store seed the client restores before components hydrate (ADR 0013). */
function storeSeed(stores: readonly AnyStoreInstance[]): unknown {
  if (stores.length === 0) return nothing;
  const snapshot = new StoreRegistry(stores).snapshot();
  for (const [name, state] of Object.entries(snapshot)) {
    warnJsonHazard(`store "${name}"`, state, 'state');
  }
  const json = scriptSafeJson(snapshot);
  return unsafeHTML(`<script type="application/json" ${STORE_SEED_ATTRIBUTE}>${json}</script>`);
}

/** The server-only document shell around the hydratable body. Never hydrated itself. */
export function page(options: PageOptions): unknown {
  const { title, body, description, head, scripts = [], stores = [] } = options;
  return serverHtml`<!doctype html>
<html lang=${options.lang ?? 'en'} dir=${options.dir ?? 'ltr'}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    ${description === undefined ? nothing : serverHtml`<meta name="description" content=${description}>`}
    ${head ?? nothing}${storeSeed(stores)}
    ${scripts.map((src) => serverHtml`<script type="module" src=${src}></script>`)}
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

/** Every render step runs with this request's stores in scope. */
function scopeOf(options: RenderOptions): StepScope {
  const registry = new StoreRegistry(options.stores ?? []);
  return (step) => withStoreScope(registry, step);
}

/** Renders to a complete string (tests, caching, static generation). */
export async function renderToString(value: unknown, options: RenderOptions = {}): Promise<string> {
  let html = '';
  for await (const chunk of renderChunks(value, scopeOf(options))) html += chunk;
  return html;
}

/** Renders to a byte stream, so the first bytes leave before the whole page is ready. */
export function renderToStream(
  value: unknown,
  options: RenderOptions = {},
): ReadableStream<Uint8Array> {
  const chunks = renderChunks(value, scopeOf(options));
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done === true) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

/** A streaming HTML `Response` for a full page. */
export function renderPage(options: PageOptions, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(renderToStream(page(options), options), { ...init, headers });
}

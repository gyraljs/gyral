// Server rendering for Gyral (docs/design-docs/0012-ssr.md). Runtime-agnostic: returns web
// `Response`/`ReadableStream`, so Hono, Deno, Bun or a Service Worker can serve it.
import { nothing } from 'lit';
import { renderChunks, serverHtml } from './internal/lit.js';

export { serverHtml };
export { formAction, seeOther } from './forms.js';
export type { FormActionHandlers } from './forms.js';

export interface PageOptions {
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

/** The server-only document shell around the hydratable body. Never hydrated itself. */
export function page(options: PageOptions): unknown {
  const { title, body, description, head, scripts = [] } = options;
  return serverHtml`<!doctype html>
<html lang=${options.lang ?? 'en'} dir=${options.dir ?? 'ltr'}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    ${description === undefined ? nothing : serverHtml`<meta name="description" content=${description}>`}
    ${head ?? nothing}
    ${scripts.map((src) => serverHtml`<script type="module" src=${src}></script>`)}
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

/** Renders to a complete string (tests, caching, static generation). */
export async function renderToString(value: unknown): Promise<string> {
  let html = '';
  for await (const chunk of renderChunks(value)) html += chunk;
  return html;
}

/** Renders to a byte stream, so the first bytes leave before the whole page is ready. */
export function renderToStream(value: unknown): ReadableStream<Uint8Array> {
  const chunks = renderChunks(value);
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
  return new Response(renderToStream(page(options)), { ...init, headers });
}

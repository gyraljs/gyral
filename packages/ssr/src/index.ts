// Server rendering for Gyral (docs/design-docs/0012-ssr.md). Runtime-agnostic: returns web
// `Response`/`ReadableStream`, so Hono, Deno, Bun or a Service Worker can serve it.
import {
  html,
  nothing,
  raw,
  scriptSafeJson,
  STORE_SEED_ATTRIBUTE,
  StoreRegistry,
  warnJsonHazard,
  type AnyStoreInstance,
  type ChildValue,
} from '@gyral/core';

// Phase 3 of the view-layer swap (ADR 0018, gyral-g1r.7): Lit SSR can't render Gyral templates
// or the new elements, and the Gyral server renderer (`@gyral/core/server`, view/06-server.md)
// arrives in Phase 4 (gyral-g1r.9). Until then the document helpers below build templates, but
// rendering throws. `serverHtml` is core's `html` (page templates are server templates, 01).
export { html as serverHtml };
export { formAction, rejectWith, seeOther } from './forms.js';
export type { FormActionHandlers, FormReject } from './forms.js';

const NO_RENDERER =
  'Phase 4 (gyral-g1r.9): @gyral/ssr has no renderer until the Gyral server renderer ' +
  '(@gyral/core/server, docs/design-docs/view/06-server.md) lands; Lit SSR cannot render ' +
  'Gyral templates.';

export interface RenderOptions {
  /**
   * This request's store instances (ADR 0013). Components read them during the render; a
   * store not listed starts from its `init`. Create new instances per request.
   */
  readonly stores?: readonly AnyStoreInstance[];
}

export interface PageOptions extends RenderOptions {
  readonly title: string;
  /** The hydratable app: an `html` template, usually one custom element. */
  readonly body: ChildValue;
  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
  readonly description?: string;
  /** Extra server-only head content, written with `serverHtml` (links, meta). */
  readonly head?: ChildValue;
  /**
   * Global CSS for the document (your app's own stylesheet text, e.g. a `?raw` import), written
   * as `<style>` elements in the head. A `</style` inside the text is escaped, so it can't
   * close the element early. Trusted CSS only: never put user input here.
   */
  readonly styles?: string | readonly string[];
  /** Module scripts to load, e.g. the client entry that imports `@gyral/ssr/hydrate` first. */
  readonly scripts?: readonly string[];
}

/** The page-level store seed the client restores before components hydrate (ADR 0013). */
function storeSeed(stores: readonly AnyStoreInstance[]): ChildValue {
  if (stores.length === 0) return nothing;
  const snapshot = new StoreRegistry(stores).snapshot();
  for (const [name, state] of Object.entries(snapshot)) {
    warnJsonHazard(`store "${name}"`, state, 'state');
  }
  const json = scriptSafeJson(snapshot);
  return raw(`<script type="application/json" ${STORE_SEED_ATTRIBUTE}>${json}</script>`);
}

// `</style` (any case) would end the element; `<\/style` is the same text to CSS.
const styleSafe = (css: string): string => css.replace(/<\/(style)/gi, '<\\/$1');

/** `<style>` elements for `page({ styles })`. */
function documentStyles(styles: string | readonly string[] | undefined): ChildValue {
  if (styles === undefined) return nothing;
  const sheets = typeof styles === 'string' ? [styles] : styles;
  return raw(sheets.map((css) => `<style>${styleSafe(css)}</style>`).join(''));
}

/** The server-only document shell around the hydratable body. Never hydrated itself. */
export function page(options: PageOptions): ChildValue {
  const { title, body, description, head, scripts = [], stores = [], styles } = options;
  return html`<!doctype html>
    <html lang=${options.lang ?? 'en'} dir=${options.dir ?? 'ltr'}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        ${description === undefined ? nothing : html`<meta name="description" content=${description} />`}
        ${documentStyles(styles)}${head ?? nothing}${storeSeed(stores)}
        ${scripts.map((src) => html`<script type="module" src=${src}></script>`)}
      </head>
      <body>
        ${body}
      </body>
    </html>`;
}

/**
 * Renders to a complete string (tests, caching, static generation). Each render step will run
 * with this request's stores in scope (`withStoreScope`, ADR 0013). Throws until Phase 4.
 */
export const renderToString: (value: ChildValue, options?: RenderOptions) => Promise<string> = () =>
  Promise.reject(new Error(NO_RENDERER));

/**
 * Renders to a byte stream, so the first bytes leave before the whole page is ready. Throws
 * until Phase 4.
 */
export const renderToStream: (
  value: ChildValue,
  options?: RenderOptions,
) => ReadableStream<Uint8Array> = () => {
  throw new Error(NO_RENDERER);
};

/** A streaming HTML `Response` for a full page. */
export function renderPage(options: PageOptions, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(renderToStream(page(options), options), { ...init, headers });
}

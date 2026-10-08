// The server-only document shell (ADR 0012 decision 4, view/06-server.md "API"): `page()` is a
// `server` template written with core's `html`, never hydrated. The page-level store seed
// (ADR 0013) and global styles go into its head as `raw()` markup.
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
import type { CspOptions } from './csp.js';

export interface RenderOptions {
  /**
   * This request's store instances (ADR 0013). Components read them during the render; a
   * store not listed starts from its `init`. Create new instances per request.
   */
  readonly stores?: readonly AnyStoreInstance[];
  /**
   * Development markers and checks (view/06-server.md "Development markers"). Default: on when
   * `@gyral/core` resolves with the `development` condition (Vite's dev server, Vitest).
   */
  readonly dev?: boolean;
}

export interface PageOptions extends RenderOptions {
  readonly title: string;
  /** The hydratable app: an `html` template, usually one custom element. */
  readonly body: ChildValue;
  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
  readonly description?: string;
  /** Extra server-only head content, written with `html` (links, meta). */
  readonly head?: ChildValue;
  /**
   * Global CSS for the document (your app's own stylesheet text, e.g. a `?raw` import), written
   * as `<style>` elements in the head. A `</style` inside the text is escaped, so it can't
   * close the element early. Trusted CSS only: never put user input here.
   */
  readonly styles?: string | readonly string[];
  /**
   * Stylesheet URLs, written as `<link rel="stylesheet">` before `styles`: in production,
   * `clientAssetsFromManifest()`'s `css` (the hashed CSS Vite emitted for what the client entry
   * imports), served immutable and allowed by `style-src 'self'` without hashes.
   */
  readonly stylesheets?: readonly string[];
  /** Module scripts to load, e.g. the client entry. */
  readonly scripts?: readonly string[];
  /**
   * Modules to fetch early with `<link rel="modulepreload">`, written before `scripts`: in
   * production, `clientAssetsFromManifest()`'s `modulepreload` (the entry's static imports and
   * the hydration chunk), so hydration doesn't wait for extra round trips.
   */
  readonly modulepreload?: readonly string[];
  /**
   * `renderPage` only: the `Content-Security-Policy` header. Pass `contentSecurityPolicy()`'s
   * options (`{ directives }`; the page's `styles` are included) to build it when the page
   * renders, with every component registered by then and the `<style>` elements allowed by
   * hash; or a header value, e.g. from `await contentSecurityPolicy({ styles })` (development
   * warns when it lacks a registered component's hash).
   */
  readonly csp?: string | CspOptions;
}

/** The page-level store seed the client restores before components hydrate (ADR 0013). */
export function storeSeed(stores: readonly AnyStoreInstance[]): ChildValue {
  if (stores.length === 0) return nothing;
  const snapshot = new StoreRegistry(stores).snapshot();
  for (const [name, state] of Object.entries(snapshot)) {
    warnJsonHazard(`store "${name}"`, state, 'state');
  }
  const json = scriptSafeJson(snapshot);
  return raw(`<script type="application/json" ${STORE_SEED_ATTRIBUTE}>${json}</script>`);
}

/** `</style` (any case) would end the element; `<\/style` is the same text to CSS. */
export const styleSafe = (css: string): string => css.replace(/<\/(style)/gi, '<\\/$1');

/** The texts of `page({ styles })`. */
export const styleList = (styles: string | readonly string[] | undefined): readonly string[] =>
  styles === undefined ? [] : typeof styles === 'string' ? [styles] : styles;

/** `<style>` elements for `page({ styles })`. */
export function documentStyles(styles: string | readonly string[] | undefined): ChildValue {
  const sheets = styleList(styles);
  if (sheets.length === 0) return nothing;
  return raw(sheets.map((css) => `<style>${styleSafe(css)}</style>`).join(''));
}

/** The server-only document shell around the hydratable body. Never hydrated itself. */
export function page(options: PageOptions): ChildValue {
  const { title, body, description, head, scripts = [], stores = [], styles } = options;
  const preload = options.modulepreload ?? [];
  const sheets = options.stylesheets ?? [];
  return html`<!doctype html>
    <html lang=${options.lang ?? 'en'} dir=${options.dir ?? 'ltr'}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        ${description === undefined ? nothing : html`<meta name="description" content=${description} />`}
        ${sheets.map((href) => html`<link rel="stylesheet" href=${href} />`)}
        ${documentStyles(styles)}${head ?? nothing}${storeSeed(stores)}
        ${[
          ...preload.map((href) => html`<link rel="modulepreload" href=${href} />`),
          ...scripts.map((src) => html`<script type="module" src=${src}></script>`),
        ]}
      </head>
      <body>
        ${body}
      </body>
    </html>`;
}

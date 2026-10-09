// Automatic component loading (ADR 0016 addendum "Automatic component loading"): the page
// links the client modules of exactly the components it rendered, and nothing when it
// rendered none. The Vite preset (`components: true`) builds the loader and its manifest; the
// render collects the tags it wrote (core's `tags` option); the tail goes after the body,
// where every tag is known, in place of the page's mark.

/** One component's client module: what to preload and link when the page renders its tag. */
export interface ComponentModule {
  /** The module's chunk and its static imports (production; empty in development). */
  readonly preload: readonly string[];
  /** Hashed CSS the module imports (production; empty in development). */
  readonly stylesheets: readonly string[];
}

/**
 * The client side of automatic component loading, for `renderPage({ components })`: from
 * `componentsFromManifest()` in production, handed over by `productionServer` and
 * `gyralDevServer`.
 */
export interface ComponentAssets {
  /** URL of the loader module, which imports each rendered tag's module when it's in the page. */
  readonly loader: string;
  /** Tag → its client module. A rendered tag missing here won't hydrate (development warns). */
  readonly modules: ReadonlyMap<string, ComponentModule>;
  /** The loader's own imports, preloaded with it (production). */
  readonly preload?: readonly string[];
  /** More module scripts for pages with components (development: Vite's client). */
  readonly scripts?: readonly string[];
}

/** Where `page()` puts the tail; replaced once the body is written. */
export const COMPONENTS_MARK = '<!--gyral:components-->';

/** An attribute value, escaped. */
export const attr = (value: string): string =>
  value.replace(/[&"<>]/g, (c) => `&#${String(c.charCodeAt(0))};`);

const warned = new Set<string>();

/**
 * The markup that loads the rendered components: their preload links and stylesheets, the
 * extra scripts and the loader. Empty when no rendered tag has a client module, so a page of
 * plain HTML ships no JavaScript.
 */
export function componentTail(
  assets: ComponentAssets,
  tags: ReadonlySet<string>,
  dev: boolean,
): string {
  const preload = new Set<string>(assets.preload);
  const sheets = new Set<string>();
  let found = false;
  for (const tag of tags) {
    const module = assets.modules.get(tag);
    if (module === undefined) {
      if (dev && !warned.has(tag)) {
        warned.add(tag);
        console.warn(
          `gyral: <${tag}> was rendered on the server, but no client module defines it, so it ` +
            "won't hydrate. Keep its module under the preset's `components.include` (default " +
            'src/), or import it from a module that is.',
        );
      }
      continue;
    }
    found = true;
    for (const href of module.preload) preload.add(href);
    for (const href of module.stylesheets) sheets.add(href);
  }
  if (!found) return '';
  return [
    ...[...sheets].map((href) => `<link rel="stylesheet" href="${attr(href)}">`),
    ...[...preload].map((href) => `<link rel="modulepreload" href="${attr(href)}">`),
    ...[...(assets.scripts ?? []), assets.loader].map(
      (src) => `<script type="module" src="${attr(src)}"></script>`,
    ),
  ].join('');
}

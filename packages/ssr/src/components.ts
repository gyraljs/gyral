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

/**
 * What the page's head already loads, so the tail leaves it out: the browser would fetch each
 * URL once either way, but the markup would repeat it (the loader imports the client entry, so
 * its preloads repeat the entry's graph, gyral-9b0).
 */
export interface HeadAssets {
  /** `modulepreload` hrefs. */
  readonly modulepreload?: readonly string[];
  /** `<link rel="stylesheet">` hrefs. */
  readonly stylesheets?: readonly string[];
  /** Module script `src`s. */
  readonly scripts?: readonly string[];
}

/** Where `page()` puts the tail; replaced once the body is written. */
const COMPONENTS_MARK = '<!--gyral:components-->';

/** The mark with the head's URLs in it (encoded, so no `-->` can end the comment early). */
const MARK = /<!--gyral:components(?::([^>]*))?-->/;

/**
 * The mark `page()` writes after the body, carrying what its head loads, so every render of
 * the page (`renderPage`, `renderToString`) leaves those URLs out of the tail.
 */
export function componentsMark(head: HeadAssets): string {
  const { modulepreload = [], stylesheets = [], scripts = [] } = head;
  if (modulepreload.length + stylesheets.length + scripts.length === 0) return COMPONENTS_MARK;
  const json = JSON.stringify({ modulepreload, stylesheets, scripts });
  return `<!--gyral:components:${encodeURIComponent(json)}-->`;
}

/** The head's URLs written into a mark by `componentsMark`. */
function headOf(encoded: string | undefined): HeadAssets {
  if (encoded === undefined) return {};
  return JSON.parse(decodeURIComponent(encoded)) as HeadAssets;
}

/**
 * Replaces the page's mark in `chunk` (when it's there) with the tail for the tags rendered so
 * far: after the body, every tag is known.
 */
export function fillMark(
  chunk: string,
  assets: ComponentAssets,
  tags: ReadonlySet<string>,
  dev: boolean,
): string {
  return chunk.replace(MARK, (_, encoded: string | undefined) =>
    componentTail(assets, tags, dev, headOf(encoded)),
  );
}

/** An attribute value, escaped. */
export const attr = (value: string): string =>
  value.replace(/[&"<>]/g, (c) => `&#${String(c.charCodeAt(0))};`);

const warned = new Set<string>();

/**
 * The markup that loads the rendered components: their preload links and stylesheets, the
 * extra scripts and the loader. Empty when no rendered tag has a client module, so a page of
 * plain HTML ships no JavaScript. Each URL appears once, and none the head already loads
 * (`head`): a module the head preloads or runs (or the tail runs) gets no preload link, and a
 * stylesheet or script the head links isn't linked again. Order is otherwise unchanged.
 */
export function componentTail(
  assets: ComponentAssets,
  tags: ReadonlySet<string>,
  dev: boolean,
  head: HeadAssets = {},
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
  const headScripts = new Set(head.scripts);
  const headSheets = new Set(head.stylesheets);
  const scripts = new Set([...(assets.scripts ?? []), assets.loader]);
  // A module the head preloads or runs, or the tail runs, needs no preload link here.
  const loaded = new Set([...(head.modulepreload ?? []), ...headScripts, ...scripts]);
  return [
    ...[...sheets]
      .filter((href) => !headSheets.has(href))
      .map((href) => `<link rel="stylesheet" href="${attr(href)}">`),
    ...[...preload]
      .filter((href) => !loaded.has(href))
      .map((href) => `<link rel="modulepreload" href="${attr(href)}">`),
    ...[...scripts]
      .filter((src) => !headScripts.has(src))
      .map((src) => `<script type="module" src="${attr(src)}"></script>`),
  ].join('');
}

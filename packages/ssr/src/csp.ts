// A Content-Security-Policy for server-rendered pages (view/06-server.md "CSP", view/08-styles.md
// "Server"): every shadow component's declarative-shadow-root `<style>` and the page's global
// `<style>` elements are allowed by their SHA-256 hashes, so `style-src` needs no
// 'unsafe-inline'. Hashes are synchronous and cached per text (core's styleHashSync), so
// `renderPage({ csp: options })` builds the header at render time, when the page's components
// are registered; `contentSecurityPolicy()` builds it ahead of time.
import { componentStyles, registryVersion, styleHashSync } from '@gyral/core/server';
import { styleList, styleSafe } from './page.js';

/** CSP directives by name: a source list, as one string or a list of sources. */
export type CspDirectives = Readonly<Record<string, string | readonly string[]>>;

export interface CspOptions {
  /**
   * Your other directives (`default-src`, `script-src`, …). A `style-src` given here is kept
   * and the hashes are appended; without one it is `'self'` plus the hashes.
   */
  readonly directives?: CspDirectives;
  /**
   * The page's global styles, exactly as passed to `page({ styles })`, hashed too. In
   * `renderPage({ csp })` it defaults to the page's own `styles`.
   */
  readonly styles?: string | readonly string[];
}

const sources = (value: string | readonly string[]): readonly string[] =>
  typeof value === 'string' ? value.split(/\s+/).filter((s) => s !== '') : value;

type PageStyles = string | readonly string[] | undefined;

/** The header for `directives` and the page's `styles`, with the components registered now. */
function build(
  directives: CspDirectives,
  styles: PageStyles,
  components: ReadonlyMap<string, string>,
): string {
  const page = styleList(styles).map((css) => styleHashSync(styleSafe(css)));
  const hashes = [...new Set([...[...components.values()].map(styleHashSync), ...page])];
  const style = [...sources(directives['style-src'] ?? "'self'"), ...hashes];
  const policy: [name: string, sources: readonly string[]][] = Object.entries(directives)
    .filter(([name]) => name !== 'style-src')
    .map(([name, value]) => [name, sources(value)]);
  policy.push(['style-src', style]);
  return policy.map(([name, list]) => [name, ...list].join(' ')).join('; ');
}

/**
 * A `Content-Security-Policy` header value whose `style-src` allows Gyral's `<style>`
 * elements by hash, for the components registered when it is called (import them first).
 * `renderPage({ …, csp: options })` builds it at render time instead; pass this result to
 * `renderPage({ …, csp })` or set it on any response. Other inline styles (`style`
 * attributes, hand-written `<style>` in `head`) are not covered.
 */
export function contentSecurityPolicy(options: CspOptions = {}): Promise<string> {
  return Promise.resolve(build(options.directives ?? {}, options.styles, componentStyles()));
}

const cache = new WeakMap<CspOptions, { version: number; styles: unknown; header: string }>();

/**
 * `renderPage({ csp: options })`: the header built at render time, cached per options object
 * until the server registry changes (any registration, so any component CSS: core's
 * `registryVersion()`) or the page styles do. The page's `styles` are hashed unless `options`
 * has its own.
 */
export function policyAtRender(options: CspOptions, pageStyles: PageStyles): string {
  const version = registryVersion();
  const styles = options.styles ?? pageStyles;
  const known = cache.get(options);
  if (known?.version === version && known.styles === styles) return known.header;
  const header = build(options.directives ?? {}, styles, componentStyles());
  cache.set(options, { version, styles, header });
  return header;
}

const warned = new Set<string>();

/**
 * Development: a header that allows styles by hash but lacks a registered component's hash
 * (built before that component registered) would block its `<style>`: warn once per tag.
 */
export function checkPolicy(header: string): void {
  const styleSrc = /(?:^|;)\s*style-src\s([^;]*)/.exec(header)?.[1];
  if (styleSrc?.includes("'sha256-") !== true || styleSrc.includes("'unsafe-inline'")) return;
  const missing = [...componentStyles()]
    .filter(([tag, text]) => !warned.has(tag) && !styleSrc.includes(styleHashSync(text)))
    .map(([tag]) => tag);
  if (missing.length === 0) return;
  for (const tag of missing) warned.add(tag);
  console.warn(
    `gyral: the Content-Security-Policy lacks the <style> hash of ${missing
      .map((tag) => `<${tag}>`)
      .join(', ')}, so the browser will block those styles: it was built before they were ` +
      `registered. Import the components before calling contentSecurityPolicy(), or pass ` +
      `the options to renderPage({ csp: { … } }) to build the header at render time ` +
      `(view/06-server.md "CSP").`,
  );
}

// A Content-Security-Policy for server-rendered pages (view/06-server.md "CSP", view/08-styles.md
// "Server"): every shadow component's declarative-shadow-root `<style>` and the page's global
// `<style>` elements are allowed by their SHA-256 hashes, so `style-src` needs no
// 'unsafe-inline'. Hashes are synchronous and cached per text (core's styleHashSync), so
// `renderPage({ csp: options })` builds the header at render time, when the page's components
// are registered; `contentSecurityPolicy()` builds it ahead of time. With
// `styleAttributes: 'hash'`, `renderPage` also allows the page's `style` attributes by hash
// (ADR 0020): it renders the page first, collecting their values, then builds the header.
import {
  componentStyles,
  registryVersion,
  styleHashSync,
  type StyleValues,
} from '@gyral/core/server';
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
  /**
   * `'hash'` (`renderPage` only, ADR 0020): allow the `style` attributes the page writes by
   * hash, in `style-src-attr` with `'unsafe-hashes'`, so they apply on first paint under a
   * strict policy. The page is rendered to a string before the response is built (its
   * headers need every value), so the body isn't chunked. Covers static, bound, multi-part and
   * element-hook values, not `raw()` markup. A `style-src-attr` given in `directives` is kept;
   * when it allows `'unsafe-inline'`, no hashes are added (a hash would disable it).
   */
  readonly styleAttributes?: 'hash';
  /**
   * The most `style` attribute hashes one page's header lists (default 128, about 7 KB of
   * header; proxies reject large headers). Values past it are left out and logged once;
   * hydration applies them.
   */
  readonly maxStyleHashes?: number;
}

const sources = (value: string | readonly string[]): readonly string[] =>
  typeof value === 'string' ? value.split(/\s+/).filter((s) => s !== '') : value;

type PageStyles = string | readonly string[] | undefined;

const ATTR = 'style-src-attr';

/**
 * The header for `directives` and the page's `styles`, with the components registered now.
 * `attributes`: hashes of the page's `style` attribute values for `style-src-attr` (ADR 0020).
 */
function build(
  directives: CspDirectives,
  styles: PageStyles,
  components: ReadonlyMap<string, string>,
  attributes: readonly string[] = [],
): string {
  const page = styleList(styles).map((css) => styleHashSync(styleSafe(css)));
  const hashes = [...new Set([...[...components.values()].map(styleHashSync), ...page])];
  const style = [...sources(directives['style-src'] ?? "'self'"), ...hashes];
  const policy: [name: string, sources: readonly string[]][] = Object.entries(directives)
    .filter(([name]) => name !== 'style-src' && (name !== ATTR || attributes.length === 0))
    .map(([name, value]) => [name, sources(value)]);
  policy.push(['style-src', style]);
  if (attributes.length > 0) {
    const given = sources(directives[ATTR] ?? []);
    const unsafe = given.includes("'unsafe-hashes'") ? [] : ["'unsafe-hashes'"];
    policy.push([ATTR, [...given, ...unsafe, ...attributes]]);
  }
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

const announced = new Set<string>();

/** Logs `message` once per process, under `key`. */
function once(key: string, message: string): void {
  if (announced.has(key)) return;
  announced.add(key);
  console.warn(message);
}

/** Distinct values a page may write before development warns (ADR 0020 "A size guard"). */
const WARN_AT = 32;

/**
 * `renderPage({ csp: { styleAttributes: 'hash' } })`: the header for a page that wrote the
 * `style` values in `values` (ADR 0020). Not cached: it depends on the page's content. No
 * hashes are added when the app's `style-src-attr` allows `'unsafe-inline'`, since a hash
 * would make the browser ignore it.
 */
export function policyWithAttributes(
  options: CspOptions,
  pageStyles: PageStyles,
  values: StyleValues,
  dev: boolean,
): string {
  const directives = options.directives ?? {};
  const given = sources(directives[ATTR] ?? []);
  let list = given.includes("'unsafe-inline'") ? [] : [...values.keys()];
  if (dev && list.length > WARN_AT) {
    const counts = new Map<string, number>();
    for (const where of values.values()) counts.set(where, (counts.get(where) ?? 0) + 1);
    const [top] = [...counts].sort((a, b) => b[1] - a[1]);
    const from = top === undefined || top[0] === '' ? '' : ` (most from ${top[0]})`;
    once(
      `many:${top?.[0] ?? ''}`,
      `gyral: this page writes ${String(list.length)} distinct style attribute values${from}; ` +
        `each adds about 54 bytes to its Content-Security-Policy header. Use a class or data ` +
        `attribute for values from a known set, or a custom property with a stylesheet ` +
        `fallback (ADR 0020).`,
    );
  }
  const max = options.maxStyleHashes ?? 128;
  if (list.length > max) {
    once(
      'cut',
      `gyral: a page wrote ${String(list.length)} distinct style attribute values; its ` +
        `Content-Security-Policy lists the first ${String(max)} (maxStyleHashes). The others ` +
        `are blocked until hydration applies them (ADR 0020).`,
    );
    list = list.slice(0, max);
  }
  const styles = options.styles ?? pageStyles;
  return build(directives, styles, componentStyles(), list.map(styleHashSync));
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
